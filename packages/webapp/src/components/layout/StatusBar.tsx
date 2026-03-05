import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useConnectionStore } from "@/stores/connection"
import { useUIStore } from "@/stores/ui"

export function StatusBar() {
  const { t } = useTranslation()
  const nodeUrl = useConnectionStore((state) => state.nodeUrl)
  const connectionStatus = useConnectionStore((state) => state.status)
  const reconnectHintVisible = useConnectionStore((state) => state.reconnectHintVisible)
  const reconnectFromStorage = useConnectionStore((state) => state.reconnectFromStorage)
  const pollingState = useUIStore((state) => state.pollingState)

  const connected = connectionStatus === "connected"
  const unhealthy = connectionStatus === "error" || connectionStatus === "disconnected"

  return (
    <div className={`flex h-9 items-center gap-3 border-t px-3 text-xs ${unhealthy ? "bg-destructive/10 text-destructive" : "text-muted-foreground"}`}>
      <span>{connected ? t("common.connected") : t("common.disconnected")}</span>
      <Badge variant={connected ? "success" : "destructive"}>{connectionStatus}</Badge>
      <span>{t("status.polling")}</span>
      <Badge variant="secondary">{pollingState}</Badge>
      <span>{t("status.sync")}</span>
      <Badge variant={connected ? "outline" : "destructive"}>{connected ? "ok" : "down"}</Badge>
      {nodeUrl && reconnectHintVisible ? (
        <Button size="xs" variant="destructive" onClick={() => void reconnectFromStorage()}>
          {t("status.reconnectNow")}
        </Button>
      ) : null}
    </div>
  )
}
