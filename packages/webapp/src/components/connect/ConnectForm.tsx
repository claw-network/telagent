import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { DidAvatar } from "@/components/shared/DidAvatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useConnectionStore } from "@/stores/connection"
import { useIdentityStore } from "@/stores/identity"
import { usePermissionStore } from "@/stores/permission"

const LOCAL_NODE_URL = "http://127.0.0.1:8787"

interface LocalNodeInfo {
  did: string
  didHash: string
  version: string
}

type ProbeStatus = "probing" | "found" | "not-found"

function useLocalNodeProbe() {
  const [status, setStatus] = useState<ProbeStatus>("probing")
  const [info, setInfo] = useState<LocalNodeInfo | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function probe() {
      setStatus("probing")
      try {
        const nodeRes = await fetch(new URL("/api/v1/node", LOCAL_NODE_URL).toString(), {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
        if (!nodeRes.ok) throw new Error("node probe failed")
        const node = await nodeRes.json()

        const selfRes = await fetch(new URL("/api/v1/identities/self", LOCAL_NODE_URL).toString(), {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
        if (!selfRes.ok) throw new Error("identity probe failed")
        const self = await selfRes.json()

        setInfo({
          did: self.did ?? "",
          didHash: self.didHash ?? "",
          version: node.version ?? "unknown",
        })
        setStatus("found")
      } catch {
        if (!controller.signal.aborted) {
          setInfo(null)
          setStatus("not-found")
        }
      }
    }

    probe()
    return () => controller.abort()
  }, [])

  return { status, info }
}

function LocalNodeAvatar() {
  const { t } = useTranslation()
  const { status, info } = useLocalNodeProbe()

  if (status === "not-found") {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <Avatar className="size-16">
          <AvatarFallback className="text-lg text-muted-foreground">?</AvatarFallback>
        </Avatar>
        <p className="text-sm text-muted-foreground">{t("connect.local.notFound")}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex items-center justify-center">
        {status === "probing" && (
          <div className="absolute inset-[-4px] animate-spin rounded-full border-2 border-transparent border-t-primary" />
        )}
        {status === "found" && info ? (
          <DidAvatar did={info.did} className="size-16 text-lg" />
        ) : (
          <Avatar className="size-16">
            <AvatarFallback className="text-lg text-muted-foreground">...</AvatarFallback>
          </Avatar>
        )}
      </div>
      {status === "found" && info && (
        <div className="flex flex-col items-center gap-1">
          <p className="max-w-xs truncate font-mono text-xs text-foreground">{info.did}</p>
          <p className="text-xs text-muted-foreground">v{info.version}</p>
        </div>
      )}
      {status === "probing" && (
        <p className="text-sm text-muted-foreground">{t("connect.local.detecting")}</p>
      )}
    </div>
  )
}

function ErrorAlert({ message }: { message: string }) {
  const { t } = useTranslation()
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("connect.failed")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function ConnectForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connect = useConnectionStore((state) => state.connect)
  const status = useConnectionStore((state) => state.status)
  const error = useConnectionStore((state) => state.error)
  const loadSelf = useIdentityStore((state) => state.loadSelf)
  const refreshPermissions = usePermissionStore((state) => state.refresh)

  const [localToken, setLocalToken] = useState("")
  const [remoteUrl, setRemoteUrl] = useState("")
  const [remoteToken, setRemoteToken] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const doConnect = async (nodeUrl: string, accessToken: string) => {
    setLocalError(null)
    try {
      await connect({ nodeUrl, accessToken })
      await loadSelf()
      await refreshPermissions()
      navigate("/chat")
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : t("connect.failed"))
    }
  }

  const onLocalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    doConnect(LOCAL_NODE_URL, localToken)
  }

  const onRemoteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    doConnect(remoteUrl, remoteToken)
  }

  const displayError = localError ?? error

  return (
    <Card className="w-full max-w-xl border-white/20 bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>{t("connect.title")}</CardTitle>
        <CardDescription>{t("connect.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="local">
          <TabsList className="w-full">
            <TabsTrigger value="local" className="flex-1">{t("connect.local.tab")}</TabsTrigger>
            <TabsTrigger value="remote" className="flex-1">{t("connect.remote.tab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="local">
            <form className="space-y-4" onSubmit={onLocalSubmit}>
              <LocalNodeAvatar />
              <div className="space-y-2">
                <Label htmlFor="local-token">{t("connect.token")}</Label>
                <Input
                  id="local-token"
                  type="password"
                  value={localToken}
                  onChange={(event) => setLocalToken(event.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              {displayError ? <ErrorAlert message={displayError} /> : null}
              <Button type="submit" className="w-full" disabled={status === "connecting"}>
                {status === "connecting" ? t("connect.connecting") : t("connect.submit")}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="remote">
            <form className="space-y-4" onSubmit={onRemoteSubmit}>
              <div className="space-y-2">
                <Label htmlFor="remote-url">{t("connect.nodeUrl")}</Label>
                <Input
                  id="remote-url"
                  placeholder="https://agent.example.com"
                  value={remoteUrl}
                  onChange={(event) => setRemoteUrl(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remote-token">{t("connect.token")}</Label>
                <Input
                  id="remote-token"
                  type="password"
                  value={remoteToken}
                  onChange={(event) => setRemoteToken(event.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              {displayError ? <ErrorAlert message={displayError} /> : null}
              <Button type="submit" className="w-full" disabled={status === "connecting"}>
                {status === "connecting" ? t("connect.connecting") : t("connect.submit")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("connect.hint")}</p>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
