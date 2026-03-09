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
const DID_REGEX = /^did:claw:z[A-Za-z0-9]{32,}$/

const DEFAULT_GATEWAYS = [
  { label: "alex.telagent.org", value: "https://alex.telagent.org" },
  { label: "bess.telagent.org", value: "https://bess.telagent.org" },
]

function isDidInput(value: string): boolean {
  return DID_REGEX.test(value.trim())
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Generic node probe (re-runs when targetUrl changes)              */
/* ------------------------------------------------------------------ */

interface NodeInfo {
  did: string
  didHash: string
  version: string
}

type ProbeStatus = "probing" | "found" | "not-found"

function useNodeProbe(targetUrl: string) {
  const [status, setStatus] = useState<ProbeStatus>("probing")
  const [info, setInfo] = useState<NodeInfo | null>(null)

  useEffect(() => {
    if (!targetUrl) return
    const controller = new AbortController()
    setStatus("probing")
    setInfo(null)

    async function probe() {
      try {
        const nodeRes = await fetch(new URL("/api/v1/node", targetUrl).toString(), {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
        if (!nodeRes.ok) throw new Error("node probe failed")
        const nodeBody = await nodeRes.json()
        const node = nodeBody.data ?? nodeBody

        const selfRes = await fetch(new URL("/api/v1/identities/self", targetUrl).toString(), {
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

    void probe()
    return () => controller.abort()
  }, [targetUrl])

  return { status, info }
}

/* ------------------------------------------------------------------ */
/*  DID probe (via gateway relay)                                     */
/* ------------------------------------------------------------------ */

type DidProbeStatus = "idle" | "probing" | "reachable" | "unreachable"

function useDidProbe(did: string, gatewayUrl: string) {
  const [status, setStatus] = useState<DidProbeStatus>("idle")
  const [latencyMs, setLatencyMs] = useState(-1)
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null)

  useEffect(() => {
    if (!did || !gatewayUrl || !isDidInput(did)) {
      setStatus("idle")
      setNodeInfo(null)
      setLatencyMs(-1)
      return
    }
    const controller = new AbortController()
    setStatus("probing")

    async function probe() {
      try {
        const encodedDid = encodeURIComponent(did.trim())

        // 1. Ping via gateway
        const pingRes = await fetch(
          `${gatewayUrl}/relay/${encodedDid}/ping`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        )
        const pingData = await pingRes.json()
        if (!pingData.data?.reachable) {
          setStatus("unreachable")
          return
        }
        setLatencyMs(pingData.data.latencyMs)

        // 2. Fetch node info via gateway
        const nodeRes = await fetch(
          `${gatewayUrl}/relay/${encodedDid}/api/v1/node`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        )
        const nodeBody = await nodeRes.json()
        const node = nodeBody.data ?? nodeBody

        // 3. Fetch identity
        const selfRes = await fetch(
          `${gatewayUrl}/relay/${encodedDid}/api/v1/identities/self`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        )
        const selfBody = await selfRes.json()
        const self = selfBody.data ?? selfBody

        setNodeInfo({
          did: self.did ?? did.trim(),
          didHash: self.didHash ?? "",
          version: node.version ?? "unknown",
        })
        setStatus("reachable")
      } catch {
        if (!controller.signal.aborted) {
          setStatus("unreachable")
        }
      }
    }

    void probe()
    return () => controller.abort()
  }, [did, gatewayUrl])

  return { status, latencyMs, nodeInfo }
}

/* ------------------------------------------------------------------ */
/*  Avatar probe display                                              */
/* ------------------------------------------------------------------ */

function NodeAvatar({ status, info, isLocal }: { status: ProbeStatus; info: NodeInfo | null; isLocal: boolean }) {
  const { t } = useTranslation()

  const isFound = status === "found" && info

  const foundLabel = isLocal ? t("connect.local.found") : t("connect.remote.found")
  const detectingLabel = isLocal ? t("connect.local.detecting") : t("connect.remote.detecting")
  const notFoundLabel = isLocal ? t("connect.local.notFound") : t("connect.remote.notFound")

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
                {foundLabel}
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
            {detectingLabel}
          </span>
        )}
        {status === "not-found" && (
          <span className="text-[13px] text-muted-foreground/70">
            {notFoundLabel}
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

  const [probeTarget, setProbeTarget] = useState(LOCAL_NODE_URL)
  const { status: probeStatus, info: probeInfo } = useNodeProbe(probeTarget)
  const isLocal = isLocalUrl(probeTarget)

  const [nodeUrl, setNodeUrl] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  // DID mode state
  const [isDid, setIsDid] = useState(false)
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAYS[0].value)
  const { status: didProbeStatus, latencyMs, nodeInfo: didNodeInfo } = useDidProbe(
    isDid ? nodeUrl : "",
    gatewayUrl,
  )

  useEffect(() => {
    if (probeStatus === "found" && isLocal && !nodeUrl) {
      setNodeUrl(LOCAL_NODE_URL)
    }
  }, [probeStatus, isLocal, nodeUrl])

  const onNodeUrlChange = (value: string) => {
    setNodeUrl(value)
    setIsDid(isDidInput(value))
  }

  const onNodeUrlBlur = () => {
    const trimmed = nodeUrl.trim()
    if (isDid || !trimmed) {
      if (!isDid) setProbeTarget(LOCAL_NODE_URL)
      return
    }
    try {
      new URL(trimmed)
      setProbeTarget(trimmed)
    } catch {
      setProbeTarget(LOCAL_NODE_URL)
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(null)
    try {
      if (isDid) {
        const trimmedDid = nodeUrl.trim()
        const relayNodeUrl = `${gatewayUrl}/relay/${encodeURIComponent(trimmedDid)}`
        await connect({
          nodeUrl: relayNodeUrl,
          passphrase,
          connectionMode: "relay",
          targetDid: trimmedDid,
          gatewayUrl,
        })
      } else {
        await connect({ nodeUrl: nodeUrl.trim(), passphrase })
      }
      await loadSelf()
      await refreshPermissions()
      navigate("/chat")
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : t("connect.failed"))
    }
  }

  const displayError = localError ?? error

  // DID mode uses didProbeStatus mapping
  const effectiveProbeStatus: ProbeStatus = isDid
    ? (didProbeStatus === "reachable" ? "found" : didProbeStatus === "unreachable" ? "not-found" : "probing")
    : probeStatus
  const effectiveInfo = isDid ? didNodeInfo : probeInfo

  const showAvatarSection = isDid
    ? didProbeStatus !== "idle"
    : (probeStatus !== "not-found" || !isLocal)

  const canSubmit = isDid
    ? !!nodeUrl.trim() && !!passphrase
    : !!nodeUrl.trim() && !!passphrase

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
            {showAvatarSection && (
              <>
                <NodeAvatar status={effectiveProbeStatus} info={effectiveInfo} isLocal={!isDid && isLocal} />
                {isDid && latencyMs > 0 && (
                  <div className="flex justify-center -mt-2 mb-2">
                    <Badge variant="secondary" className="px-2 py-0 text-[10px] font-normal">
                      {latencyMs}ms
                    </Badge>
                  </div>
                )}
                <Separator className="mb-5" />
              </>
            )}

            <div className={cn("space-y-4", !showAvatarSection && "pt-6")}>
              <div>
                <Label htmlFor="node-url" className="mb-2 block text-[13px]">
                  {isDid ? t("connect.did.label") : t("connect.nodeUrl")}
                </Label>
                <Input
                  id="node-url"
                  placeholder={isDid ? "did:claw:z6tor6XFy..." : (probeStatus === "found" && isLocal ? LOCAL_NODE_URL : "https://agent.example.com")}
                  value={nodeUrl}
                  onChange={(event) => onNodeUrlChange(event.target.value)}
                  onBlur={onNodeUrlBlur}
                />
                {isDid && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("connect.did.hint")}
                  </p>
                )}
              </div>

              {isDid && (
                <div>
                  <Label htmlFor="gateway" className="mb-2 block text-[13px]">
                    {t("connect.did.gateway")}
                  </Label>
                  <select
                    id="gateway"
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {DEFAULT_GATEWAYS.map((gw) => (
                      <option key={gw.value} value={gw.value}>{gw.label}</option>
                    ))}
                  </select>
                </div>
              )}

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
              disabled={status === "connecting" || !canSubmit}
            >
              {status === "connecting" ? t("connect.connecting") : t("connect.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
