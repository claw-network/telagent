import { useMemo, useRef, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useVirtualizer } from "@tanstack/react-virtual"

import { useMessageSender } from "@/hooks/use-message-sender"
import { useIdentityStore } from "@/stores/identity"
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
    estimateSize: (index) => (rows[index]?.kind === "date" ? 34 : 96),
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
      <div className="h-full overflow-y-auto rounded-xl border bg-card/35">
        <EmptyState
          title={t("chat.noMessages")}
          description={t("chat.emptyDescription")}
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto rounded-xl border bg-card/35" ref={parentRef}>
      <div
        className="relative w-full px-3 py-3"
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
                ref={rowVirtualizer.measureElement}
              >
                <div className="my-2 text-center text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5">{row.label}</span>
                </div>
              </div>
            )
          }

          const senderHint = row.value.sealedHeader
          const isSelf = selfDid ? senderHint.includes(selfDid.slice(-8)) : false

          return (
            <div
              key={row.key}
              className="absolute left-0 w-full px-1"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
              ref={rowVirtualizer.measureElement}
            >
              <MemoMessageBubble
                message={row.value}
                align={isSelf ? "right" : "left"}
                onRetry={handleRetry}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
