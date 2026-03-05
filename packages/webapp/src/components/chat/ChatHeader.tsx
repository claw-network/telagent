import { InfoIcon } from "lucide-react"

import { ContactActions } from "@/components/contact/ContactActions"
import { Button } from "@/components/ui/button"
import type { ConversationSummary } from "@/types/webapp"

interface ChatHeaderProps {
  conversation: ConversationSummary | null
  onOpenInfo: () => void
}

export function ChatHeader({ conversation, onOpenInfo }: ChatHeaderProps) {
  if (!conversation) {
    return (
      <div className="flex h-14 items-center justify-between border-b px-4">
        <span className="text-sm text-muted-foreground">Select a conversation</span>
      </div>
    )
  }

  return (
    <div className="flex h-14 items-center justify-between border-b px-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{conversation.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{conversation.conversationId}</p>
      </div>
      <div className="flex items-center gap-1">
        {conversation.conversationType === "direct" ? (
          <ContactActions conversationId={conversation.conversationId} />
        ) : null}
        <Button variant="ghost" size="icon-sm" onClick={onOpenInfo}>
          <InfoIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
