import { GiftIcon, PaperclipIcon, PlusCircleIcon, SendHorizonalIcon, SmileIcon, StickerIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useConversationAccess } from "@/hooks/use-conversation-access"
import { useGuardedAction } from "@/hooks/use-guarded-action"
import { useMessageSender } from "@/hooks/use-message-sender"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
    <div className="border-t border-black/25 bg-[#313338] px-4 py-4">
      <div className="flex items-center gap-2 rounded-lg bg-[#383a40] px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-[#b5bac1] hover:bg-[#4a4d55]"
          disabled={!canSend || sending}
          onClick={() => fileRef.current?.click()}
        >
          <PlusCircleIcon className="size-5" />
        </Button>

        <Input
          value={text}
          disabled={!canSend || sending}
          placeholder={canSend ? `Message #${conversation?.displayName ?? "general"}` : t("chat.observerHint")}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void onSend()
            }
          }}
          className="h-9 border-none bg-transparent text-[17px] text-[#dcddde] placeholder:text-[#72767d] focus-visible:ring-0"
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
          variant="ghost"
          size="icon-sm"
          className="text-[#b5bac1] hover:bg-[#4a4d55]"
          disabled={!canSend || sending}
          onClick={() => fileRef.current?.click()}
        >
          <PaperclipIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" className="text-[#b5bac1] hover:bg-[#4a4d55]">
          <GiftIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" className="text-[#b5bac1] hover:bg-[#4a4d55]">
          <StickerIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" className="text-[#b5bac1] hover:bg-[#4a4d55]">
          <SmileIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          className="size-8 rounded-md bg-[#5865f2] text-white hover:bg-[#5b6cf9]"
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
