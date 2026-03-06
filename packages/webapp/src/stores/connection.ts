import { TelagentSdk } from "@telagent/sdk"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

interface ConnectInput {
  nodeUrl: string
  accessToken: string
}

interface ConnectionStore {
  nodeUrl: string
  accessToken: string
  status: ConnectionStatus
  error?: string
  reconnectHintVisible: boolean
  sdk: TelagentSdk | null
  connect: (input: ConnectInput) => Promise<void>
  reconnectFromStorage: () => Promise<void>
  disconnect: () => void
  setStatus: (status: ConnectionStatus) => void
  markUnreachable: (reason?: string) => void
  setReconnectHintVisible: (visible: boolean) => void
}

async function probeNode(nodeUrl: string, accessToken?: string): Promise<void> {
  const target = new URL("/api/v1/node", nodeUrl).toString()
  const response = await fetch(target, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(`Node probe failed with status ${response.status}`)
  }
}

function normalizeNodeUrl(raw: string): string {
  const trimmed = raw.trim()
  const parsed = new URL(trimmed)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("nodeUrl must use http or https")
  }
  return parsed.origin
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set, get) => ({
      nodeUrl: "",
      accessToken: "",
      status: "disconnected",
      error: undefined,
      reconnectHintVisible: false,
      sdk: null,
      connect: async (input) => {
        const nodeUrl = normalizeNodeUrl(input.nodeUrl)
        const accessToken = input.accessToken.trim()

        set({ status: "connecting", error: undefined })
        try {
          await probeNode(nodeUrl, accessToken || undefined)
          const sdk = new TelagentSdk({
            baseUrl: nodeUrl,
            accessToken: accessToken || undefined,
          })
          set({
            nodeUrl,
            accessToken,
            sdk,
            status: "connected",
            error: undefined,
            reconnectHintVisible: false,
          })
        } catch (error) {
          set({ status: "error", error: error instanceof Error ? error.message : String(error), sdk: null })
          throw error
        }
      },
      reconnectFromStorage: async () => {
        const { nodeUrl, accessToken } = get()
        if (!nodeUrl) {
          return
        }

        set({ status: "connecting", error: undefined })
        try {
          await probeNode(nodeUrl, accessToken || undefined)
          set({
            sdk: new TelagentSdk({
              baseUrl: nodeUrl,
              accessToken: accessToken || undefined,
            }),
            status: "connected",
            error: undefined,
            reconnectHintVisible: false,
          })
        } catch (error) {
          set({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            sdk: null,
            reconnectHintVisible: true,
          })
        }
      },
      disconnect: () => {
        set({
          nodeUrl: "",
          accessToken: "",
          sdk: null,
          status: "disconnected",
          error: undefined,
          reconnectHintVisible: false,
        })
      },
      setStatus: (status) => {
        set({ status })
      },
      markUnreachable: (reason) => {
        const current = get()
        if (!current.nodeUrl) {
          return
        }
        set({
          status: "error",
          error: reason ?? current.error ?? "Node unreachable",
          reconnectHintVisible: true,
        })
      },
      setReconnectHintVisible: (visible) => {
        set({ reconnectHintVisible: visible })
      },
    }),
    {
      name: "telagent-webapp-connection",
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        nodeUrl: state.nodeUrl,
        accessToken: state.accessToken,
      }),
    },
  ),
)
