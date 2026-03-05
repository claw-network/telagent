import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { formatApiError, isLikelyNetworkError } from "@/lib/api-error"
import { useConnectionStore } from "@/stores/connection"
import { useConversationStore } from "@/stores/conversation"
import { useMessageStore } from "@/stores/message"
import { useUIStore } from "@/stores/ui"

const ACTIVE_INTERVAL_MS = 3_000
const IDLE_INTERVAL_MS = 15_000

export function usePollMessages() {
  const { t } = useTranslation()
  const sdk = useConnectionStore((state) => state.sdk)
  const nodeUrl = useConnectionStore((state) => state.nodeUrl)
  const accessToken = useConnectionStore((state) => state.accessToken)
  const status = useConnectionStore((state) => state.status)
  const markUnreachable = useConnectionStore((state) => state.markUnreachable)
  const selectedConversationId = useConversationStore((state) => state.selectedConversationId)
  const mergeConversations = useConversationStore((state) => state.mergeFromEnvelopes)
  const markRead = useConversationStore((state) => state.markRead)
  const refreshConversations = useConversationStore((state) => state.refreshFromApi)

  const setPollingState = useUIStore((state) => state.setPollingState)

  const upsertMessages = useMessageStore((state) => state.upsertMessages)
  const mergeGlobalMessages = useMessageStore((state) => state.mergeGlobalMessages)
  const cursorsByConversation = useMessageStore((state) => state.cursorsByConversation)
  const globalCursor = useMessageStore((state) => state.globalCursor)

  const activeInFlight = useRef(false)
  const globalInFlight = useRef(false)
  const seenRetractionIds = useRef(new Set<string>())
  const lastErrorRef = useRef<{ key: string; at: number }>({ key: "", at: 0 })

  useEffect(() => {
    if (!sdk || !nodeUrl || status !== "connected") {
      setPollingState("paused")
      return undefined
    }

    let activeTimer: number | undefined
    let globalTimer: number | undefined

    const reportPollingError = (error: unknown, fallback: string) => {
      if (isLikelyNetworkError(error)) {
        markUnreachable(formatApiError(error, fallback))
        return
      }

      const message = formatApiError(error, fallback)
      const now = Date.now()
      if (lastErrorRef.current.key === message && now - lastErrorRef.current.at < 4_000) {
        return
      }
      lastErrorRef.current = { key: message, at: now }
      toast.error(message)
    }

    const pollActiveConversation = async () => {
      if (!selectedConversationId || activeInFlight.current || document.hidden) {
        return
      }
      activeInFlight.current = true
      setPollingState("active")
      try {
        const cursor = cursorsByConversation[selectedConversationId]
        const result = await sdk.pullMessages({
          conversationId: selectedConversationId,
          cursor: cursor ?? undefined,
          limit: 100,
        })
        upsertMessages(selectedConversationId, result.items, result.cursor)
        mergeConversations(result.items)
        markRead(selectedConversationId)
      } catch (error) {
        reportPollingError(error, t("chat.pollFailed"))
      } finally {
        activeInFlight.current = false
      }
    }

    const pollGlobal = async () => {
      if (globalInFlight.current || document.hidden) {
        return
      }
      globalInFlight.current = true
      if (!selectedConversationId) {
        setPollingState("idle")
      }
      try {
        await refreshConversations()
        const result = await sdk.pullMessages({
          cursor: globalCursor ?? undefined,
          limit: 200,
        })
        mergeGlobalMessages(result.items, result.cursor)
        mergeConversations(result.items)
      } catch (error) {
        reportPollingError(error, t("chat.pollFailed"))
      } finally {
        globalInFlight.current = false
      }
    }

    const pollRetracted = async () => {
      if (document.hidden) {
        return
      }

      try {
        const endpoint = new URL("/api/v1/messages/retracted?limit=50", nodeUrl).toString()
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            accept: "application/json",
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          },
          signal: AbortSignal.timeout(5_000),
        })
        if (!response.ok) {
          return
        }
        const payload = (await response.json()) as {
          data?: {
            items?: Array<{ envelopeId: string; conversationId: string }>
          }
        }
        const items = payload.data?.items ?? []
        for (const entry of items) {
          if (seenRetractionIds.current.has(entry.envelopeId)) {
            continue
          }
          seenRetractionIds.current.add(entry.envelopeId)
          toast.info(`Retracted message in ${entry.conversationId}`)
        }
      } catch (error) {
        reportPollingError(error, t("chat.pollFailed"))
      }
    }

    const startTimers = () => {
      window.clearInterval(activeTimer)
      window.clearInterval(globalTimer)

      activeTimer = window.setInterval(() => {
        void pollActiveConversation()
      }, ACTIVE_INTERVAL_MS)

      globalTimer = window.setInterval(() => {
        void pollGlobal()
        void pollRetracted()
      }, IDLE_INTERVAL_MS)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        setPollingState("paused")
        return
      }
      void pollGlobal()
      void pollActiveConversation()
      void pollRetracted()
      setPollingState(selectedConversationId ? "active" : "idle")
    }

    document.addEventListener("visibilitychange", handleVisibility)
    startTimers()
    void pollGlobal()
    void pollActiveConversation()
    void pollRetracted()

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.clearInterval(activeTimer)
      window.clearInterval(globalTimer)
    }
  }, [
    accessToken,
    cursorsByConversation,
    globalCursor,
    markRead,
    refreshConversations,
    mergeConversations,
    mergeGlobalMessages,
    nodeUrl,
    sdk,
    selectedConversationId,
    setPollingState,
    t,
    status,
    upsertMessages,
    markUnreachable,
  ])
}
