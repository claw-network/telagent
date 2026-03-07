import { useMemo, useRef, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useVirtualizer } from "@tanstack/react-virtual"

import { useMessageSender } from "@/hooks/use-message-sender"
import { DidAvatar } from "@/components/shared/DidAvatar"
import { useIdentityStore } from "@/stores/identity"
import { useConversationStore } from "@/stores/conversation"
import type { MessageWithStatus } from "@/types/webapp"
import { MemoMessageBubble } from "@/components/chat/MessageBubble"
import { EmptyState } from "@/components/shared/EmptyState"

interface MessageListProps {
  messages: MessageWithStatus[]
}

type RenderRow =
  | { kind: "date"; key: string; label: string }
  | { kind: "message"; key: string; value: MessageWithStatus }

function dateLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()

  if (sameDay(date, today)) {
    return "Today"
  }
  if (sameDay(date, yesterday)) {
    return "Yesterday"
  }
  return date.toLocaleDateString()
}

export function MessageList({ messages }: MessageListProps) {
  const { t } = useTranslation()
  const selfDid = useIdentityStore((state) => state.self?.did)
  const selectedConversationId = useConversationStore((state) => state.selectedConversationId)
  const activeConversation = useConversationStore((state) =>
    state.conversations.find((item) => item.conversationId === selectedConversationId) ?? null,
  )
  const { retryMessage } = useMessageSender()
  const parentRef = useRef<HTMLDivElement | null>(null)
  const handleRetry = useCallback((message: MessageWithStatus) => {
    void retryMessage(message)
  }, [retryMessage])

  const rows = useMemo<RenderRow[]>(() => {
    const nextRows: RenderRow[] = []
    let lastDateLabel: string | null = null

    for (const message of messages) {
      const currentDateLabel = dateLabel(message.sentAtMs)
      if (currentDateLabel !== lastDateLabel) {
        nextRows.push({
          kind: "date",
          key: `date:${currentDateLabel}:${message.envelopeId}`,
          label: currentDateLabel,
        })
        lastDateLabel = currentDateLabel
      }
      nextRows.push({
        kind: "message",
        key: message.envelopeId,
        value: message,
      })
    }
    return nextRows
  }, [messages])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.kind === "date" ? 30 : 108),
    overscan: 12,
  })

  useEffect(() => {
    if (rows.length === 0) {
      return
    }
    rowVirtualizer.scrollToIndex(rows.length - 1, {
      align: "end",
      behavior: "smooth",
    })
  }, [rows.length, rowVirtualizer])

  if (rows.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <EmptyState
          title={t("chat.noMessages")}
          description={t("chat.emptyDescription")}
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto" ref={parentRef}>
      <div
        className="relative w-full pb-3"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index]
          if (!row) {
            return null
          }

          if (row.kind === "date") {
            return (
              <div
                key={row.key}
                className="absolute left-0 w-full px-1"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
              >
                <div className="my-2 text-center text-[11px] text-[#949ba4]">
                  <span className="rounded-full bg-[#232428] px-2 py-0.5">{row.label}</span>
                </div>
              </div>
            )
          }

          const senderHint = row.value.sealedHeader
          const isSelf = selfDid ? senderHint.includes(selfDid.slice(-8)) : false
          const fallbackPeerName = activeConversation?.peerDid
            ? activeConversation.peerDid.split(":").at(-1)
            : "baggingspam"
          const senderName = isSelf ? "you" : (fallbackPeerName || "baggingspam")
          const avatarDid = isSelf
            ? (selfDid ?? "did:claw:me")
            : (activeConversation?.peerDid ?? "did:claw:baggingspam")

          return (
            <div
              key={row.key}
              className="absolute left-0 w-full px-4"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
              data-index={virtualItem.index}
              ref={rowVirtualizer.measureElement}
            >
              <div className="group flex gap-3 rounded-sm px-1 py-1 hover:bg-[#2e3035]">
                <DidAvatar did={avatarDid} className="mt-0.5 size-10 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-end gap-2">
                    <span className="text-base font-semibold text-[#f2f3f5]">{senderName}</span>
                    <span className="text-xs text-[#949ba4]">
                      {new Date(row.value.sentAtMs).toLocaleDateString()} {new Date(row.value.sentAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <MemoMessageBubble
                    message={row.value}
                    align={isSelf ? "right" : "left"}
                    onRetry={handleRetry}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
