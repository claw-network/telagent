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
  return (
    <div className={cn("flex w-full", align === "right" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          align === "right"
            ? "rounded-br-sm bg-[color:var(--chat-bubble-self)]"
            : "rounded-bl-sm bg-[color:var(--chat-bubble-peer)]",
          provisional ? "border border-dashed border-amber-400/70" : "",
        )}
      >
        <p className="break-words whitespace-pre-wrap">{text}</p>
        {attachmentManifestHash ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            attachment: {shortHash(attachmentManifestHash, 8)}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  )
}
