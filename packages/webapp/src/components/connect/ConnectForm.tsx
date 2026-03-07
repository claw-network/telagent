import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { DidAvatar } from "@/components/shared/DidAvatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useConnectionStore } from "@/stores/connection"
import { useIdentityStore } from "@/stores/identity"
import { usePermissionStore } from "@/stores/permission"

const LOCAL_NODE_URL = "http://127.0.0.1:9529"

/* ------------------------------------------------------------------ */
/*  Local node auto-detection                                         */
/* ------------------------------------------------------------------ */

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
        const nodeBody = await nodeRes.json()
        const node = nodeBody.data ?? nodeBody

        const selfRes = await fetch(new URL("/api/v1/identities/self", LOCAL_NODE_URL).toString(), {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
        if (!selfRes.ok) throw new Error("identity probe failed")
        const selfBody = await selfRes.json()
        const self = selfBody.data ?? selfBody

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

/* ------------------------------------------------------------------ */
/*  Avatar probe display                                              */
/* ------------------------------------------------------------------ */

function LocalNodeAvatar({ status, info }: { status: ProbeStatus; info: LocalNodeInfo | null }) {
  const { t } = useTranslation()

  const isFound = status === "found" && info

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {/* Avatar ring container */}
      <div className="relative">
        {/* Glow effect when found */}
        {isFound && (
          <div className="absolute inset-[-8px] rounded-full bg-primary/8 blur-md" />
        )}

        {/* Ring */}
        <div
          className={cn(
            "absolute inset-[-4px] rounded-full transition-all duration-700",
            status === "probing" && "border-[2.5px] border-transparent border-t-primary border-r-primary/40 animate-spin",
            isFound && "border-[2.5px] border-primary/25",
            status === "not-found" && "border-[2px] border-dashed border-muted-foreground/15",
          )}
        />

        {/* Avatar */}
        {isFound ? (
          <DidAvatar did={info.did} className="relative size-[72px] text-2xl" />
        ) : (
          <Avatar className="relative size-[72px]">
            <AvatarFallback
              className={cn(
                "text-2xl transition-colors duration-500",
                status === "probing"
                  ? "bg-muted text-muted-foreground/60"
                  : "bg-muted/60 text-muted-foreground/30",
              )}
            >
              {status === "probing" ? "..." : "?"}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Status text */}
      <div className="flex flex-col items-center gap-2">
        {isFound && (
          <>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-foreground">
                {t("connect.local.found")}
              </span>
              <Badge variant="secondary" className="px-2 py-0 text-[10px] font-normal">
                v{info.version}
              </Badge>
            </div>
            <p className="max-w-[300px] truncate font-mono text-[11px] leading-none text-muted-foreground/70">
              {info.did}
            </p>
          </>
        )}
        {status === "probing" && (
          <span className="text-[13px] text-muted-foreground">
            {t("connect.local.detecting")}
          </span>
        )}
        {status === "not-found" && (
          <span className="text-[13px] text-muted-foreground/70">
            {t("connect.local.notFound")}
          </span>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Connect form                                                      */
/* ------------------------------------------------------------------ */

export function ConnectForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const connect = useConnectionStore((state) => state.connect)
  const status = useConnectionStore((state) => state.status)
  const error = useConnectionStore((state) => state.error)
  const loadSelf = useIdentityStore((state) => state.loadSelf)
  const refreshPermissions = usePermissionStore((state) => state.refresh)

  const { status: probeStatus, info: probeInfo } = useLocalNodeProbe()
  const [nodeUrl, setNodeUrl] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (probeStatus === "found" && !nodeUrl) {
      setNodeUrl(LOCAL_NODE_URL)
    }
  }, [probeStatus])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(null)
    try {
      await connect({ nodeUrl: nodeUrl.trim(), passphrase })
      await loadSelf()
      await refreshPermissions()
      navigate("/chat")
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : t("connect.failed"))
    }
  }

  const displayError = localError ?? error

  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-8">
      {/* Title area */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("connect.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("connect.subtitle")}</p>
      </div>

      {/* Card */}
      <Card className="w-full border-border/60 py-0 gap-0 shadow-lg">
        <CardContent className="px-6 pt-0 pb-6">
          <form onSubmit={onSubmit}>
            {probeStatus !== "not-found" && (
              <>
                <LocalNodeAvatar status={probeStatus} info={probeInfo} />
                <Separator className="mb-5" />
              </>
            )}

            <div className={cn("space-y-4", probeStatus === "not-found" && "pt-6")}>
              <div>
                <Label htmlFor="node-url" className="mb-2 block text-[13px]">
                  {t("connect.nodeUrl")}
                </Label>
                <Input
                  id="node-url"
                  placeholder={probeStatus === "found" ? LOCAL_NODE_URL : "https://agent.example.com"}
                  value={nodeUrl}
                  onChange={(event) => setNodeUrl(event.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="passphrase" className="mb-2 block text-[13px]">
                  {t("connect.passphrase")}
                </Label>
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="••••••••"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            {displayError ? (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{displayError}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              className="mt-5 w-full"
              disabled={status === "connecting" || !nodeUrl.trim() || !passphrase}
            >
              {status === "connecting" ? t("connect.connecting") : t("connect.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
