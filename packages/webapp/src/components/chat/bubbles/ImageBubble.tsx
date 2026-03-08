import { useEffect, useRef, useState } from "react"

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface ImageBubbleProps {
  align: "left" | "right"
  imageUrl?: string
  timestamp: number
  provisional?: boolean
  attachmentManifestHash?: string
  showTail?: boolean
}

export function ImageBubble({
  imageUrl,
  provisional,
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

  if (!imageUrl) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={provisional ? "opacity-60" : ""}
    >
      {shouldLoad ? (
        <Dialog>
          <DialogTrigger asChild>
            <img
              src={imageUrl}
              alt="image"
              loading="lazy"
              className="block max-h-72 max-w-[280px] cursor-zoom-in rounded-[4px] object-cover"
            />
          </DialogTrigger>
          <DialogContent className="max-w-4xl bg-black/95 p-2" aria-describedby={undefined}>
            <DialogTitle className="sr-only">Image preview</DialogTitle>
            <img src={imageUrl} alt="image-full" className="max-h-[85vh] w-full rounded object-contain" />
          </DialogContent>
        </Dialog>
      ) : (
        <div className="h-48 w-[280px]" />
      )}
    </div>
  )
}
