import type { AgentIdentityView } from "@telagent/sdk"
import { create } from "zustand"

import { useConnectionStore } from "@/stores/connection"

interface IdentityStore {
  self: AgentIdentityView | null
  loading: boolean
  error?: string
  loadSelf: () => Promise<void>
  clear: () => void
}

export const useIdentityStore = create<IdentityStore>((set) => ({
  self: null,
  loading: false,
  error: undefined,
  loadSelf: async () => {
    const sdk = useConnectionStore.getState().sdk
    if (!sdk) {
      set({ self: null, loading: false, error: "SDK not connected" })
      return
    }

    set({ loading: true, error: undefined })
    try {
      const self = await sdk.getSelfIdentity()
      set({ self, loading: false, error: undefined })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },
  clear: () => {
    set({ self: null, loading: false, error: undefined })
  },
}))
