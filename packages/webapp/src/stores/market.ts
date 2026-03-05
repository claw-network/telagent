import type { BidTaskInput, PublishTaskInput, ReviewInput } from "@telagent/sdk"
import { create } from "zustand"

import { useConnectionStore } from "@/stores/connection"

export interface MarketTaskView {
  id: string
  title: string
  description?: string
  budget?: number
  status: string
  owner?: string
  tags?: string[]
  deadlineMs?: number
  raw: unknown
}

export interface MarketBidView {
  id: string
  bidder?: string
  amount?: number
  status: string
  proposal?: string
  createdAtMs?: number
  raw: unknown
}

interface MarketStore {
  tasks: MarketTaskView[]
  searchResults: MarketTaskView[]
  bidsByTask: Record<string, MarketBidView[]>
  loadingTasks: boolean
  loadingBids: boolean
  error?: string
  refreshTasks: (filters?: Record<string, string>) => Promise<void>
  searchMarkets: (q: string, type?: string) => Promise<void>
  loadBids: (taskId: string) => Promise<void>
  publishTask: (sessionToken: string, input: PublishTaskInput) => Promise<unknown>
  bid: (sessionToken: string, taskId: string, input: BidTaskInput) => Promise<unknown>
  acceptBid: (sessionToken: string, taskId: string, bidId: string) => Promise<unknown>
  submitReview: (sessionToken: string, input: ReviewInput) => Promise<unknown>
  createServiceContract: (sessionToken: string, payload: Record<string, unknown>) => Promise<unknown>
  getTaskById: (taskId: string) => MarketTaskView | null
  clear: () => void
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function parseTask(raw: unknown, index: number): MarketTaskView {
  const source = asRecord(raw)
  return {
    id: pickString(source, ["id", "taskId", "listingId"]) ?? `task-${index}`,
    title: pickString(source, ["title", "name"]) ?? `Task ${index + 1}`,
    description: pickString(source, ["description", "summary", "content"]),
    budget: pickNumber(source, ["budget", "amount", "price"]),
    status: pickString(source, ["status", "state"]) ?? "unknown",
    owner: pickString(source, ["owner", "publisher", "creator", "did"]),
    tags: Array.isArray(source.tags) ? source.tags.filter((item): item is string => typeof item === "string") : undefined,
    deadlineMs:
      parseTimestamp(source.deadlineMs)
      ?? parseTimestamp(source.deadline)
      ?? parseTimestamp(source.dueAt),
    raw,
  }
}

function parseBid(raw: unknown, index: number): MarketBidView {
  const source = asRecord(raw)
  return {
    id: pickString(source, ["id", "bidId"]) ?? `bid-${index}`,
    bidder: pickString(source, ["bidder", "did", "owner"]),
    amount: pickNumber(source, ["amount", "price", "value"]),
    status: pickString(source, ["status", "state"]) ?? "unknown",
    proposal: pickString(source, ["proposal", "message", "description"]),
    createdAtMs:
      parseTimestamp(source.createdAtMs)
      ?? parseTimestamp(source.createdAt)
      ?? parseTimestamp(source.updatedAt),
    raw,
  }
}

function sortTasks(items: MarketTaskView[]): MarketTaskView[] {
  return [...items].sort((left, right) => {
    const rightScore = right.deadlineMs ?? right.budget ?? 0
    const leftScore = left.deadlineMs ?? left.budget ?? 0
    return rightScore - leftScore
  })
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  tasks: [],
  searchResults: [],
  bidsByTask: {},
  loadingTasks: false,
  loadingBids: false,
  error: undefined,
  refreshTasks: async (filters) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      return
    }

    set({ loadingTasks: true, error: undefined })
    try {
      const rawTasks = await sdk.listTasks(filters)
      const tasks = sortTasks(rawTasks.map((task, index) => parseTask(task, index)))
      set({ tasks, loadingTasks: false })
    } catch (error) {
      set({
        loadingTasks: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
  searchMarkets: async (q, type) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      return
    }

    set({ loadingTasks: true, error: undefined })
    try {
      const rawResults = await sdk.searchMarkets({ q, type })
      const searchResults = sortTasks(rawResults.map((task, index) => parseTask(task, index)))
      set({ searchResults, loadingTasks: false })
    } catch (error) {
      set({
        loadingTasks: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
  loadBids: async (taskId) => {
    const normalizedTaskId = taskId.trim()
    if (!normalizedTaskId) {
      return
    }

    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      return
    }

    set({ loadingBids: true, error: undefined })
    try {
      const rawBids = await sdk.listTaskBids(normalizedTaskId)
      const bids = rawBids.map((bid, index) => parseBid(bid, index))
      set((state) => ({
        bidsByTask: {
          ...state.bidsByTask,
          [normalizedTaskId]: bids,
        },
        loadingBids: false,
      }))
    } catch (error) {
      set({
        loadingBids: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
  publishTask: async (sessionToken, input) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      throw new Error("SDK not connected")
    }

    const result = await sdk.publishTask(sessionToken, input)
    await get().refreshTasks()
    return result
  },
  bid: async (sessionToken, taskId, input) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      throw new Error("SDK not connected")
    }

    const result = await sdk.bid(sessionToken, taskId, input)
    await get().loadBids(taskId)
    return result
  },
  acceptBid: async (sessionToken, taskId, bidId) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      throw new Error("SDK not connected")
    }

    const result = await sdk.acceptBid(sessionToken, taskId, bidId)
    await Promise.all([get().refreshTasks(), get().loadBids(taskId)])
    return result
  },
  submitReview: async (sessionToken, input) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      throw new Error("SDK not connected")
    }

    return sdk.submitReview(sessionToken, input)
  },
  createServiceContract: async (sessionToken, payload) => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      throw new Error("SDK not connected")
    }

    return sdk.createServiceContract(sessionToken, payload)
  },
  getTaskById: (taskId) => {
    const normalizedTaskId = taskId.trim()
    if (!normalizedTaskId) {
      return null
    }

    const state = get()
    return state.tasks.find((task) => task.id === normalizedTaskId)
      ?? state.searchResults.find((task) => task.id === normalizedTaskId)
      ?? null
  },
  clear: () => {
    set({
      tasks: [],
      searchResults: [],
      bidsByTask: {},
      loadingTasks: false,
      loadingBids: false,
      error: undefined,
    })
  },
}))
