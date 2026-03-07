import { TelagentSdk } from "@telagent/sdk"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

interface ConnectInput {
  nodeUrl: string
  passphrase: string
}

interface ConnectionStore {
  nodeUrl: string
  sessionToken: string
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

async function probeNode(nodeUrl: string): Promise<void> {
  const target = new URL("/api/v1/node", nodeUrl).toString()
  const response = await fetch(target, {
    method: "GET",
    headers: { accept: "application/json" },
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
      sessionToken: "",
      status: "disconnected",
      error: undefined,
      reconnectHintVisible: false,
      sdk: null,
      connect: async (input) => {
        const nodeUrl = normalizeNodeUrl(input.nodeUrl)
        const passphrase = input.passphrase

        set({ status: "connecting", error: undefined })
        try {
          // 1. Probe (no auth required)
          await probeNode(nodeUrl)

          // 2. Create temp SDK for unlock (no accessToken needed; endpoint is whitelisted)
          const tempSdk = new TelagentSdk({ baseUrl: nodeUrl })
          const result = await tempSdk.unlockSession({ passphrase })

          // 3. Create authenticated SDK with session token
          const sdk = new TelagentSdk({
            baseUrl: nodeUrl,
            accessToken: result.sessionToken,
          })
          set({
            nodeUrl,
            sessionToken: result.sessionToken,
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
        const { nodeUrl, sessionToken } = get()
        if (!nodeUrl || !sessionToken) {
          return
        }

        set({ status: "connecting", error: undefined })
        try {
          // Probe /api/v1/session (auth-required endpoint) to validate the token is still active.
          // /api/v1/node is whitelisted (no auth), so probing it would succeed even with an
          // expired token and leave the app in a broken "connected" state.
          const target = new URL("/api/v1/session", nodeUrl).toString()
          const response = await fetch(target, {
            method: "GET",
            headers: {
              accept: "application/json",
              authorization: `Bearer ${sessionToken}`,
            },
            signal: AbortSignal.timeout(5_000),
          })

          if (!response.ok) {
            throw new Error(
              response.status === 401
                ? "Session expired. Please reconnect."
                : `Node probe failed with status ${response.status}`,
            )
          }

          set({
            sdk: new TelagentSdk({
              baseUrl: nodeUrl,
              accessToken: sessionToken,
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
          sessionToken: "",
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
        sessionToken: state.sessionToken,
      }),
    },
  ),
)
