import { FileIcon, DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { shortHash } from "@/components/chat/bubbles/payload-utils"

interface FileBubbleProps {
  align: "left" | "right"
  filename: string
  timestamp: number
  onDownload?: () => void
  provisional?: boolean
  attachmentManifestHash?: string
}

export function FileBubble({
  align,
  filename,
  timestamp,
  onDownload,
  provisional,
  attachmentManifestHash,
}: FileBubbleProps) {
  return (
    <div className={cn("flex w-full", align === "right" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] px-3 py-2",
          align === "right"
            ? "rounded-2xl rounded-br-sm bg-[color:var(--chat-bubble-self)] shadow-sm"
            : "rounded-lg bg-[#2b2d31]/80",
          provisional ? "border border-dashed border-amber-400/70" : "",
        )}
      >
        <div className="flex items-center gap-2">
          <FileIcon className="size-4 text-muted-foreground" />
          <span className="max-w-56 truncate text-sm">{filename}</span>
          <Button variant="ghost" size="icon-xs" onClick={onDownload}>
            <DownloadIcon className="size-3.5" />
          </Button>
        </div>
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
