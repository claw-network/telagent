import { EyeIcon, ShieldCheckIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { usePermissionStore } from "@/stores/permission"

export function ModeBadge() {
  const mode = usePermissionStore((state) => state.mode)

  if (mode === "intervener") {
    return (
      <Badge variant="secondary" className="gap-1 border border-blue-300/30 bg-blue-500/20 text-blue-200">
        <ShieldCheckIcon className="size-3.5" />
        Intervener
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-1">
      <EyeIcon className="size-3.5" />
      Observer
    </Badge>
  )
}
