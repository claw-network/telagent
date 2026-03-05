import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function colorForDid(did: string): string {
  const hue = hashString(did) % 360
  return `hsl(${hue} 68% 45%)`
}

function initialsFromDid(did: string): string {
  if (!did) {
    return "AG"
  }
  const tail = did.split(":").at(-1) ?? did
  return tail.slice(0, 2).toUpperCase()
}

interface DidAvatarProps {
  did: string
  className?: string
}

export function DidAvatar({ did, className }: DidAvatarProps) {
  return (
    <Avatar className={cn("size-9", className)}>
      <AvatarFallback style={{ backgroundColor: colorForDid(did), color: "white" }}>
        {initialsFromDid(did)}
      </AvatarFallback>
    </Avatar>
  )
}
