import {
  BellIcon,
  HashIcon,
  HelpCircleIcon,
  PinIcon,
  SearchIcon,
  Users2Icon,
} from "lucide-react"

import { ContactActions } from "@/components/contact/ContactActions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ConversationSummary } from "@/types/webapp"

interface ChatHeaderProps {
  conversation: ConversationSummary | null
  onOpenInfo: () => void
}

export function ChatHeader({ conversation, onOpenInfo }: ChatHeaderProps) {
  if (!conversation) {
    return (
      <div className="flex h-12 items-center justify-between border-b border-black/20 px-4 text-[#949ba4]">
        <span className="text-sm">Select a conversation</span>
      </div>
    )
  }

  return (
    <div className="flex h-12 items-center justify-between border-b border-black/20 px-4 text-[#dbdee1] shadow-[0_1px_0_rgba(0,0,0,0.25)]">
      <div className="flex min-w-0 items-center gap-2">
        <HashIcon className="size-5 text-[#949ba4]" />
        <p className="truncate text-[21px] font-semibold leading-none">{conversation.displayName}</p>
        <span className="mx-1 h-5 w-px bg-[#4f545c]" />
        <p className="truncate text-sm text-[#949ba4]">Welcome to {conversation.displayName}</p>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon-xs" className="text-[#b5bac1] hover:bg-[#383a40]">
          <BellIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-xs" className="text-[#b5bac1] hover:bg-[#383a40]">
          <PinIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-xs" className="text-[#b5bac1] hover:bg-[#383a40]" onClick={onOpenInfo}>
          <Users2Icon className="size-4" />
        </Button>
        {conversation.conversationType === "direct" ? (
          <ContactActions conversationId={conversation.conversationId} />
        ) : null}
        <div className="relative ml-2">
          <SearchIcon className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-[#949ba4]" />
          <Input
            readOnly
            value="Search"
            className="h-7 w-[180px] border-none bg-[#1e1f22] pr-8 text-xs text-[#949ba4] focus-visible:ring-0"
          />
        </div>
        <Button variant="ghost" size="icon-xs" className="text-[#b5bac1] hover:bg-[#383a40]">
          <HelpCircleIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
