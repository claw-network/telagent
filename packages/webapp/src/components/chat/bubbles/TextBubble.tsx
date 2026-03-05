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
    <div className={cn("flex w-full", align === "right" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[86%] text-[17px] leading-6 text-[#dcddde]",
          self
            ? "rounded-xl bg-[color:var(--chat-bubble-self)] px-3 py-2 shadow-sm"
            : "px-0 py-0",
          provisional ? "border border-dashed border-amber-400/70" : "",
        )}
      >
        <p className="break-words whitespace-pre-wrap">{text}</p>
        {attachmentManifestHash ? (
          <p className="mt-1 text-[10px] text-[#949ba4]">
            attachment: {shortHash(attachmentManifestHash, 8)}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] text-[#949ba4]">
          {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  )
}
