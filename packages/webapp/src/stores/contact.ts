import type { AgentIdentityView } from "@telagent/sdk"
import { create } from "zustand"

import { useConnectionStore } from "@/stores/connection"

interface ContactStore {
  identitiesByDid: Record<string, AgentIdentityView>
  loadingByDid: Record<string, boolean>
  errorByDid: Record<string, string | undefined>
  resolve: (did: string, force?: boolean) => Promise<AgentIdentityView | null>
  clear: () => void
}

function normalizeDid(raw: string): string {
  return raw.trim()
}

export const useContactStore = create<ContactStore>((set, get) => ({
  identitiesByDid: {},
  loadingByDid: {},
  errorByDid: {},
  resolve: async (did, force = false) => {
    const normalizedDid = normalizeDid(did)
    if (!normalizedDid) {
      return null
    }

    const cached = get().identitiesByDid[normalizedDid]
    if (cached && !force) {
      return cached
    }

    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      set((state) => ({
        errorByDid: {
          ...state.errorByDid,
          [normalizedDid]: "SDK not connected",
        },
      }))
      return null
    }

    set((state) => ({
      loadingByDid: {
        ...state.loadingByDid,
        [normalizedDid]: true,
      },
      errorByDid: {
        ...state.errorByDid,
        [normalizedDid]: undefined,
      },
    }))

    try {
      const identity = await sdk.getIdentity(normalizedDid)
      set((state) => ({
        identitiesByDid: {
          ...state.identitiesByDid,
          [normalizedDid]: identity,
        },
        loadingByDid: {
          ...state.loadingByDid,
          [normalizedDid]: false,
        },
      }))
      return identity
    } catch (error) {
      set((state) => ({
        loadingByDid: {
          ...state.loadingByDid,
          [normalizedDid]: false,
        },
        errorByDid: {
          ...state.errorByDid,
          [normalizedDid]: error instanceof Error ? error.message : String(error),
        },
      }))
      return null
    }
  },
  clear: () => {
    set({
      identitiesByDid: {},
      loadingByDid: {},
      errorByDid: {},
    })
  },
}))
