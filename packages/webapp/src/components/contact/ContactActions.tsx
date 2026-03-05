import { MessageSquareIcon, Trash2Icon } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { useGuardedAction } from "@/hooks/use-guarded-action"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useConversationStore } from "@/stores/conversation"
import { useMessageStore } from "@/stores/message"

interface ContactActionsProps {
  conversationId: string
}

export function ContactActions({ conversationId }: ContactActionsProps) {
  const navigate = useNavigate()
  const { canExecute } = useGuardedAction("manage_contacts")
  const removeConversation = useConversationStore((state) => state.removeConversation)
  const removeMessageConversation = useMessageStore((state) => state.removeConversation)

  if (!canExecute) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            navigate(`/chat/${encodeURIComponent(conversationId)}`)
          }}
        >
          <MessageSquareIcon className="mr-2 size-3.5" />
          Open chat
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            removeConversation(conversationId)
            removeMessageConversation(conversationId)
            toast.success("Contact conversation removed from local view")
            navigate("/chat")
          }}
        >
          <Trash2Icon className="mr-2 size-3.5" />
          Remove contact
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
