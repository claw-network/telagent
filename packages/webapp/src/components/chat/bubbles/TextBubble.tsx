import { cn } from "@/lib/utils"
import { shortHash } from "@/components/chat/bubbles/payload-utils"

interface TextBubbleProps {
  align: "left" | "right"
  text: string
  timestamp: number
  provisional?: boolean
  attachmentManifestHash?: string
}

export function TextBubble({ align, text, timestamp, provisional, attachmentManifestHash }: TextBubbleProps) {
  const self = align === "right"
  return (
    <div
      className={cn(
        "inline-block rounded-2xl px-3.5 py-2 text-[16px] leading-[22px] shadow-sm",
        self
          ? "rounded-br-md bg-[color:var(--chat-bubble-self)] text-[color:var(--chat-bubble-self-fg)]"
          : "rounded-bl-md bg-[color:var(--chat-bubble-peer)] text-[color:var(--chat-bubble-peer-fg)]",
        provisional ? "border border-dashed border-amber-400/70" : "",
      )}
    >
      <p className="break-words whitespace-pre-wrap">{text}</p>
      {attachmentManifestHash ? (
        <p className={cn("mt-1 text-[10px]", self ? "text-white/60" : "text-black/40 dark:text-white/40")}>
          attachment: {shortHash(attachmentManifestHash, 8)}
        </p>
      ) : null}
    </div>
  )
}
