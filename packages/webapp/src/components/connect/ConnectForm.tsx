import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConnectionStore } from "@/stores/connection"
import { useIdentityStore } from "@/stores/identity"
import { usePermissionStore } from "@/stores/permission"

export function ConnectForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connect = useConnectionStore((state) => state.connect)
  const status = useConnectionStore((state) => state.status)
  const error = useConnectionStore((state) => state.error)
  const loadSelf = useIdentityStore((state) => state.loadSelf)
  const refreshPermissions = usePermissionStore((state) => state.refresh)

  const [nodeUrl, setNodeUrl] = useState("http://127.0.0.1:8787")
  const [accessToken, setAccessToken] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(null)

    try {
      await connect({
        nodeUrl,
        accessToken,
      })
      await loadSelf()
      await refreshPermissions()
      navigate("/chat")
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : t("connect.failed"))
    }
  }

  return (
    <Card className="w-full max-w-xl border-white/20 bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>{t("connect.title")}</CardTitle>
        <CardDescription>{t("connect.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="node-url">{t("connect.nodeUrl")}</Label>
            <Input
              id="node-url"
              placeholder="https://agent.example.com"
              value={nodeUrl}
              onChange={(event) => setNodeUrl(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="access-token">{t("connect.token")}</Label>
            <Input
              id="access-token"
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              autoComplete="off"
            />
          </div>
          {localError || error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("connect.failed")}</AlertTitle>
              <AlertDescription>{localError ?? error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={status === "connecting"}>
            {status === "connecting" ? t("connect.connecting") : t("connect.submit")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("connect.hint")}</p>
        </form>
      </CardContent>
    </Card>
  )
}
