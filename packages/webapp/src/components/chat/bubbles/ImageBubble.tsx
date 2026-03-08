import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { shortHash } from "@/components/chat/bubbles/payload-utils"
import { BubbleTail } from "@/components/chat/bubbles/BubbleTail"

interface ImageBubbleProps {
  align: "left" | "right"
  imageUrl?: string
  timestamp: number
  provisional?: boolean
  attachmentManifestHash?: string
  showTail?: boolean
}

export function ImageBubble({
  align,
  imageUrl,
  timestamp,
  provisional,
  attachmentManifestHash,
  showTail = true,
}: ImageBubbleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !imageUrl) {
      return
    }

    if (!("IntersectionObserver" in window)) {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: "120px",
      },
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [imageUrl])

  const shouldLoad = inView || !imageUrl

  const self = align === "right"
  return (
    <div className="relative w-fit">
    <div
      ref={containerRef}
      className={cn(
        "w-fit overflow-hidden rounded-[18px]",
        self
          ? "bg-[var(--chat-bubble-self)]"
          : "bg-[var(--chat-bubble-peer)]",
        showTail && self && "rounded-br-[4px]",
        showTail && !self && "rounded-bl-[4px]",
        provisional ? "opacity-60" : "",
      )}
    >
        {imageUrl && shouldLoad ? (
          <Dialog>
            <DialogTrigger asChild>
              <img
                src={imageUrl}
                alt="attachment"
                loading="lazy"
                className={cn(
                  "max-h-72 w-full cursor-zoom-in object-cover",
                  align === "right" ? "rounded-lg" : "rounded-sm",
                )}
              />
            </DialogTrigger>
            <DialogContent className="max-w-4xl bg-black/95 p-2">
              <img src={imageUrl} alt="attachment-full" className="max-h-[85vh] w-full rounded object-contain" />
            </DialogContent>
          </Dialog>
        ) : imageUrl ? (
          <div className="flex min-h-28 min-w-48 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            Image hidden until visible
          </div>
        ) : (
          <div className="flex min-h-28 min-w-48 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            Image preview unavailable
          </div>
        )}
        {attachmentManifestHash ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            attachment: {shortHash(attachmentManifestHash, 8)}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
    </div>
    {showTail && <BubbleTail align={align} />}
    </div>
  )
}
