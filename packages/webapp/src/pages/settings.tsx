import { useTranslation } from "react-i18next"

import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/shared/ThemeSwitcher"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useConnectionStore } from "@/stores/connection"
import { usePermissionStore } from "@/stores/permission"
import { useSessionStore } from "@/stores/session"

export function SettingsPage() {
  const { t } = useTranslation()
  const nodeUrl = useConnectionStore((state) => state.nodeUrl)
  const disconnect = useConnectionStore((state) => state.disconnect)
  const clearPermissions = usePermissionStore((state) => state.clear)
  const clearSession = useSessionStore((state) => state.clear)

  const onDisconnect = () => {
    disconnect()
    clearPermissions()
    clearSession()
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold">{t("settings.title")}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.node")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{nodeUrl || t("common.disconnected")}</p>
          <Button variant="destructive" onClick={onDisconnect}>{t("settings.disconnect")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.theme")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>
    </div>
  )
}
