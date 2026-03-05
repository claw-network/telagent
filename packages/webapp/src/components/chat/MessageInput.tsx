import { PaperclipIcon, SendHorizonalIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useConversationAccess } from "@/hooks/use-conversation-access"
import { useGuardedAction } from "@/hooks/use-guarded-action"
import { useMessageSender } from "@/hooks/use-message-sender"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useConversationStore } from "@/stores/conversation"

export function MessageInput() {
  const { t } = useTranslation()
  const selectedConversationId = useConversationStore((state) => state.selectedConversationId)
  const conversation = useConversationStore((state) =>
    state.conversations.find((item) => item.conversationId === state.selectedConversationId) ?? null,
  )

  const { canExecute, reason } = useGuardedAction("send_message")
  const access = useConversationAccess(selectedConversationId)
  const canSend = Boolean(conversation) && canExecute && access.canIntervene

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const { sendText, sendAttachment } = useMessageSender()

  const helperText = !conversation
    ? t("chat.emptyDescription")
    : !canExecute
      ? reason ?? t("chat.observerHint")
      : !access.canIntervene
        ? t("chat.private")
        : null

  const onSend = async () => {
    if (!canSend || !text.trim()) {
      return
    }
    setSending(true)
    try {
      await sendText({
        text,
        conversationId: conversation?.conversationId,
      })
      setText("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  const onAttach = async (file: File | null) => {
    if (!file || !canSend) {
      return
    }
    setSending(true)
    try {
      await sendAttachment({
        file,
        conversationId: conversation?.conversationId,
      })
      toast.success("Attachment queued")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attachment upload failed")
    } finally {
      setSending(false)
      if (fileRef.current) {
        fileRef.current.value = ""
      }
    }
  }

  return (
    <div className="border-t bg-card/50 p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          disabled={!canSend || sending}
          placeholder={canSend ? t("chat.sendPlaceholder") : t("chat.observerHint")}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void onSend()
            }
          }}
          className="min-h-[72px]"
        />
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            void onAttach(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!canSend || sending}
          onClick={() => fileRef.current?.click()}
        >
          <PaperclipIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          disabled={!canSend || sending || !text.trim()}
          onClick={() => void onSend()}
        >
          <SendHorizonalIcon className="size-4" />
        </Button>
      </div>
      {helperText ? (
        <p className="mt-2 text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  )
}
