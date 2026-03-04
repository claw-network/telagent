import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  LayoutDashboardIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ServerIcon,
  Settings2Icon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react"

import { loadOwnerNodeSnapshot } from "@/lib/api"
import {
  createDefaultTargets,
  readStoredTargets,
  sanitizeTargets,
  writeStoredTargets,
} from "@/lib/config"
import {
  formatAgo,
  formatCount,
  formatMs,
  formatPercent,
  formatUptime,
  truncateDid,
} from "@/lib/format"
import type { HealthLevel, NodeTarget, OwnerNodeSnapshot } from "@/lib/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { toast } from "sonner"

function nextTargetId(targets: NodeTarget[]): string {
  const existing = new Set(targets.map((target) => target.id))
  let counter = 1
  while (existing.has(`node-${counter}`)) {
    counter += 1
  }
  return `node-${counter}`
}

function healthLabel(level: HealthLevel): string {
  if (level === "healthy") {
    return "Healthy"
  }
  if (level === "degraded") {
    return "Degraded"
  }
  return "Offline"
}

function levelIcon(level: HealthLevel | "pending") {
  if (level === "healthy") {
    return <CircleCheckIcon className="size-4 text-emerald-600" />
  }
  if (level === "degraded") {
    return <CircleAlertIcon className="size-4 text-amber-600" />
  }
  if (level === "offline") {
    return <CircleXIcon className="size-4 text-rose-600" />
  }
  return <InfoIcon className="size-4 text-muted-foreground" />
}

export function App() {
  const [targets, setTargets] = useState<NodeTarget[]>(() => readStoredTargets())
  const [snapshots, setSnapshots] = useState<Partial<Record<string, OwnerNodeSnapshot>>>(
    {}
  )
  const [selectedTargetId, setSelectedTargetId] = useState<string>("")
  const [activeView, setActiveView] = useState<"overview" | "config">("overview")
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
  const [pollSeconds, setPollSeconds] = useState<number>(20)
  const [requestTimeoutMs, setRequestTimeoutMs] = useState<number>(6500)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [pendingDeleteTargetId, setPendingDeleteTargetId] = useState<string | null>(
    null
  )
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const enabledTargets = useMemo(
    () => targets.filter((target) => target.enabled),
    [targets]
  )

  const refreshNow = useCallback(
    async (options: { notify?: boolean } = {}) => {
      const activeTargets = targets.filter((target) => target.enabled)
      if (activeTargets.length === 0) {
        setSnapshots({})
        setLastRefreshAt(new Date().toISOString())
        return
      }

      setIsRefreshing(true)
      setRefreshError(null)

      try {
        const latest = await Promise.all(
          activeTargets.map((target) =>
            loadOwnerNodeSnapshot(target, { timeoutMs: requestTimeoutMs })
          )
        )
        const latestById = Object.fromEntries(
          latest.map((snapshot) => [snapshot.target.id, snapshot])
        )

        setSnapshots((previous) => {
          const next: Partial<Record<string, OwnerNodeSnapshot>> = {}
          for (const target of targets) {
            const snapshot = latestById[target.id] ?? previous[target.id]
            if (snapshot) {
              next[target.id] = snapshot
            }
          }
          return next
        })

        const nowIso = new Date().toISOString()
        setLastRefreshAt(nowIso)
        if (options.notify) {
          toast.success("Refresh Complete", {
            description: `${latest.length} node(s) sampled at ${nowIso}`,
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setRefreshError(message)
        if (options.notify) {
          toast.error("Refresh Failed", {
            description: message,
          })
        }
      } finally {
        setIsRefreshing(false)
      }
    },
    [requestTimeoutMs, targets, toast]
  )

  useEffect(() => {
    if (targets.length === 0) {
      setSelectedTargetId("")
      return
    }

    if (!targets.some((target) => target.id === selectedTargetId)) {
      setSelectedTargetId(targets[0].id)
    }
  }, [selectedTargetId, targets])

  useEffect(() => {
    void refreshNow()
    // refresh once on boot; subsequent refreshes are timer/manual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!autoRefresh) {
      return undefined
    }

    const timer = window.setInterval(() => {
      void refreshNow()
    }, Math.max(5, pollSeconds) * 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [autoRefresh, pollSeconds, refreshNow])

  const fleet = useMemo(() => {
    let healthy = 0
    let degraded = 0
    let offline = 0
    let pending = 0
    let totalRequests = 0
    let totalCritical = 0
    let totalWarn = 0
    let p95Sum = 0
    let p95Samples = 0

    for (const target of enabledTargets) {
      const snapshot = snapshots[target.id]
      if (!snapshot) {
        pending += 1
        continue
      }

      if (snapshot.health.level === "healthy") {
        healthy += 1
      } else if (snapshot.health.level === "degraded") {
        degraded += 1
      } else {
        offline += 1
      }

      totalRequests += snapshot.raw.metrics?.totals.requests ?? 0
      totalCritical += snapshot.criticalAlerts
      totalWarn += snapshot.warnAlerts
      p95Sum += snapshot.p95LatencyMs
      p95Samples += 1
    }

    return {
      total: enabledTargets.length,
      healthy,
      degraded,
      offline,
      pending,
      totalRequests,
      totalCritical,
      totalWarn,
      avgP95LatencyMs: p95Samples > 0 ? p95Sum / p95Samples : 0,
    }
  }, [enabledTargets, snapshots])

  const selectedTarget =
    targets.find((target) => target.id === selectedTargetId) ?? null
  const selectedSnapshot = selectedTarget ? snapshots[selectedTarget.id] : undefined
  const pendingDeleteTarget =
    targets.find((target) => target.id === pendingDeleteTargetId) ?? null

  function persistTargets(nextTargets: Array<Partial<NodeTarget>>) {
    const sanitized = sanitizeTargets(nextTargets)
    setTargets(sanitized)
    writeStoredTargets(sanitized)
  }

  function updateTarget(id: string, patch: Partial<NodeTarget>) {
    setTargets((previous) => {
      const updated = previous.map((target) =>
        target.id === id ? { ...target, ...patch } : target
      )
      const sanitized = sanitizeTargets(updated)
      writeStoredTargets(sanitized)
      return sanitized
    })
  }

  function addTarget() {
    setTargets((previous) => {
      const id = nextTargetId(previous)
      const next = sanitizeTargets([
        ...previous,
        {
          id,
          label: `Node ${previous.length + 1}`,
          baseUrl: "https://",
          enabled: true,
        },
      ])
      writeStoredTargets(next)
      setSelectedTargetId(id)
      toast.success("Node Added", {
        description: `${id} has been added to monitoring targets.`,
      })
      return next
    })
  }

  function confirmRemoveTarget() {
    if (!pendingDeleteTargetId || targets.length <= 1) {
      setPendingDeleteTargetId(null)
      return
    }

    setTargets((previous) => {
      const next = sanitizeTargets(
        previous.filter((target) => target.id !== pendingDeleteTargetId)
      )
      writeStoredTargets(next)
      return next
    })

    setPendingDeleteTargetId(null)
    toast.success("Node Removed", {
      description: `${pendingDeleteTargetId} removed from monitoring targets.`,
    })
  }

  function confirmResetDefaults() {
    const defaults = createDefaultTargets()
    persistTargets(defaults)
    setSnapshots({})
    setSelectedTargetId(defaults[0]?.id ?? "")
    setResetDialogOpen(false)
    toast.success("Defaults Restored", {
      description: "Target list has been reset to alex + bess.",
    })
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <div className="flex items-center gap-2 rounded-md border bg-sidebar-accent/40 px-3 py-2">
            <LayoutDashboardIcon className="size-4 text-sidebar-primary" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">TelAgent Owner</span>
              <span className="truncate text-xs text-muted-foreground">
                Monitoring Console
              </span>
            </div>
          </div>
          <SidebarInput value={lastRefreshAt ? formatAgo(lastRefreshAt) : "never"} readOnly />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeView === "overview"}
                    onClick={() => setActiveView("overview")}
                    tooltip="Overview"
                  >
                    <ServerIcon />
                    <span>Fleet Overview</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeView === "config"}
                    onClick={() => setActiveView("config")}
                    tooltip="Config"
                  >
                    <Settings2Icon />
                    <span>Target Config</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Fleet Health</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="space-y-3 px-2 pb-1 text-xs">
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground">
                  <span>Healthy</span>
                  <span className="text-right font-medium text-foreground">
                    {fleet.healthy}
                  </span>
                  <span>Degraded</span>
                  <span className="text-right font-medium text-foreground">
                    {fleet.degraded}
                  </span>
                  <span>Offline/Pending</span>
                  <span className="text-right font-medium text-foreground">
                    {fleet.offline + fleet.pending}
                  </span>
                </div>
                <Progress
                  value={
                    fleet.total > 0
                      ? (fleet.healthy / Math.max(1, fleet.total)) * 100
                      : 0
                  }
                />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <Button
            size="sm"
            className="w-full"
            onClick={() => void refreshNow({ notify: true })}
            disabled={isRefreshing}
          >
            {isRefreshing ? <Spinner className="size-4" /> : <RefreshCwIcon className="size-4" />}
            Refresh
          </Button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <div className="flex h-svh flex-col">
          <header className="sticky top-0 z-10 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <SidebarTrigger />
              <Separator orientation="vertical" className="!h-6" />
              <div className="mr-auto">
                <h1 className="text-base font-semibold">Owner Monitoring Console</h1>
                <p className="text-xs text-muted-foreground">
                  Last refresh: {lastRefreshAt ? `${lastRefreshAt} (${formatAgo(lastRefreshAt)})` : "never"}
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Auto
                <input
                  className="size-4"
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                />
              </label>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Interval</span>
                <select
                  className="h-8 rounded-md border bg-background px-2"
                  value={pollSeconds}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10)
                    setPollSeconds(Number.isFinite(value) ? value : 20)
                  }}
                >
                  <option value={10}>10s</option>
                  <option value={20}>20s</option>
                  <option value={30}>30s</option>
                  <option value={60}>60s</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Timeout</span>
                <Input
                  className="h-8 w-24"
                  type="number"
                  min={1000}
                  max={20000}
                  step={500}
                  value={requestTimeoutMs}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10)
                    setRequestTimeoutMs(
                      Number.isFinite(value)
                        ? Math.max(1000, Math.min(20000, value))
                        : 6500
                    )
                  }}
                />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-hidden px-4 py-4 md:px-6">
            {refreshError ? (
              <Alert variant="destructive" className="mb-4">
                <ShieldAlertIcon className="size-4" />
                <AlertTitle>Sampling Error</AlertTitle>
                <AlertDescription>{refreshError}</AlertDescription>
              </Alert>
            ) : null}

            <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Active Nodes</CardDescription>
                  <CardTitle className="text-2xl">{fleet.total}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Health Mix</CardDescription>
                  <CardTitle className="text-xl">
                    {fleet.healthy} / {fleet.degraded} / {fleet.offline + fleet.pending}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Average P95</CardDescription>
                  <CardTitle className="text-2xl">{formatMs(fleet.avgP95LatencyMs)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Alerts</CardDescription>
                  <CardTitle className="text-2xl">
                    {fleet.totalCritical}C / {fleet.totalWarn}W
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Requests</CardDescription>
                  <CardTitle className="text-2xl">{formatCount(fleet.totalRequests)}</CardTitle>
                </CardHeader>
              </Card>
            </section>

            {activeView === "overview" ? (
              <section className="grid h-[calc(100%-11.25rem)] gap-4 xl:grid-cols-[1.35fr_1fr]">
                <Card className="min-h-0">
                  <CardHeader>
                    <CardTitle className="text-base">Fleet Table</CardTitle>
                    <CardDescription>
                      Click a row to inspect node-specific diagnostics.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-[calc(100%-5.5rem)] p-0">
                    <ScrollArea className="h-full">
                      <table className="w-full min-w-[760px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-3 font-medium">Node</th>
                            <th className="px-3 py-3 font-medium">Status</th>
                            <th className="px-3 py-3 font-medium">DID</th>
                            <th className="px-3 py-3 font-medium">Error</th>
                            <th className="px-3 py-3 font-medium">P95</th>
                            <th className="px-3 py-3 font-medium">DLQ</th>
                            <th className="px-3 py-3 font-medium">Alerts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enabledTargets.length === 0 ? (
                            <tr>
                              <td className="px-4 py-8 text-sm text-muted-foreground" colSpan={7}>
                                No active nodes. Enable at least one target in config.
                              </td>
                            </tr>
                          ) : (
                            enabledTargets.map((target) => {
                              const snapshot = snapshots[target.id]
                              const level = snapshot?.health.level ?? "pending"

                              return (
                                <tr
                                  key={target.id}
                                  onClick={() => setSelectedTargetId(target.id)}
                                  className={`cursor-pointer border-b transition-colors hover:bg-muted/45 ${
                                    selectedTargetId === target.id ? "bg-muted/60" : ""
                                  }`}
                                >
                                  <td className="px-4 py-3">
                                    <div className="grid gap-0.5">
                                      <span className="font-medium">{target.label}</span>
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {snapshot?.federationDomain || target.baseUrl || "-"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs">
                                      {levelIcon(level)}
                                      <span>
                                        {level === "pending" ? "Pending" : healthLabel(level)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3">
                                    {snapshot?.identityDid ? (
                                      <HoverCard>
                                        <HoverCardTrigger asChild>
                                          <button className="font-mono text-xs text-primary underline decoration-dotted underline-offset-2">
                                            {truncateDid(snapshot.identityDid, 18, 8)}
                                          </button>
                                        </HoverCardTrigger>
                                        <HoverCardContent className="w-80 text-xs">
                                          <p className="mb-2 font-medium">Identity DID</p>
                                          <p className="font-mono break-all text-muted-foreground">
                                            {snapshot.identityDid}
                                          </p>
                                        </HoverCardContent>
                                      </HoverCard>
                                    ) : isRefreshing ? (
                                      <Skeleton className="h-4 w-26" />
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    {snapshot ? (
                                      formatPercent(snapshot.errorRateRatio)
                                    ) : (
                                      <Skeleton className="h-4 w-14" />
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    {snapshot ? (
                                      formatMs(snapshot.p95LatencyMs)
                                    ) : (
                                      <Skeleton className="h-4 w-14" />
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    {snapshot ? (
                                      formatCount(snapshot.dlqPending)
                                    ) : (
                                      <Skeleton className="h-4 w-10" />
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    {snapshot ? (
                                      <span className="text-xs">
                                        {snapshot.criticalAlerts}C / {snapshot.warnAlerts}W
                                      </span>
                                    ) : (
                                      <Skeleton className="h-4 w-16" />
                                    )}
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="min-h-0">
                  <CardHeader>
                    <CardTitle className="text-base">Node Detail</CardTitle>
                    <CardDescription>
                      {selectedTarget?.label || "Select a node from the table"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-[calc(100%-5.5rem)] p-0">
                    {!selectedTarget ? (
                      <div className="px-6 py-8 text-sm text-muted-foreground">
                        Choose a node from Fleet Table first.
                      </div>
                    ) : !selectedSnapshot ? (
                      <div className="space-y-3 px-6 py-4">
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-18 w-full" />
                        <Skeleton className="h-40 w-full" />
                      </div>
                    ) : (
                      <Tabs defaultValue="health" className="h-full px-4 pb-4">
                        <TabsList variant="line" className="mt-1">
                          <TabsTrigger value="health">Health</TabsTrigger>
                          <TabsTrigger value="alerts">Alerts</TabsTrigger>
                          <TabsTrigger value="routes">Routes</TabsTrigger>
                          <TabsTrigger value="raw">Raw</TabsTrigger>
                        </TabsList>

                        <TabsContent value="health" className="h-[calc(100%-2.5rem)]">
                          <ScrollArea className="h-full pr-1">
                            <div className="space-y-4 px-1 py-1">
                              <Card>
                                <CardHeader className="pb-2">
                                  <CardDescription>Health Score</CardDescription>
                                  <CardTitle className="text-2xl">
                                    {selectedSnapshot.health.score}
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <Progress value={selectedSnapshot.health.score} />
                                </CardContent>
                              </Card>

                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <Card>
                                  <CardContent className="space-y-1 pt-4">
                                    <p className="text-muted-foreground">Uptime</p>
                                    <p className="text-sm font-medium">
                                      {formatUptime(
                                        selectedSnapshot.raw.metrics?.uptimeSec ?? 0
                                      )}
                                    </p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardContent className="space-y-1 pt-4">
                                    <p className="text-muted-foreground">Fetch Cost</p>
                                    <p className="text-sm font-medium">
                                      {formatMs(selectedSnapshot.totalLatencyMs)}
                                    </p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardContent className="space-y-1 pt-4">
                                    <p className="text-muted-foreground">Requests</p>
                                    <p className="text-sm font-medium">
                                      {formatCount(
                                        selectedSnapshot.raw.metrics?.totals.requests ?? 0
                                      )}
                                    </p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardContent className="space-y-1 pt-4">
                                    <p className="text-muted-foreground">Mailbox Stale</p>
                                    <p className="text-sm font-medium">
                                      {formatCount(selectedSnapshot.mailboxStaleSec)}s
                                    </p>
                                  </CardContent>
                                </Card>
                              </div>

                              <Card>
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-sm">Health Reasons</CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                                    {selectedSnapshot.health.reasons.map((reason) => (
                                      <li key={reason}>{reason}</li>
                                    ))}
                                  </ul>
                                </CardContent>
                              </Card>
                            </div>
                          </ScrollArea>
                        </TabsContent>

                        <TabsContent value="alerts" className="h-[calc(100%-2.5rem)]">
                          <ScrollArea className="h-full pr-1">
                            <div className="space-y-2 py-1">
                              {selectedSnapshot.alerts.length === 0 ? (
                                <Alert>
                                  <InfoIcon />
                                  <AlertTitle>No Active Alert</AlertTitle>
                                  <AlertDescription>
                                    Node monitoring reports no active WARN/CRITICAL alert.
                                  </AlertDescription>
                                </Alert>
                              ) : (
                                selectedSnapshot.alerts.map((alert) => (
                                  <Alert
                                    key={`${alert.code}-${alert.title}`}
                                    variant={
                                      alert.level === "CRITICAL"
                                        ? "destructive"
                                        : "default"
                                    }
                                  >
                                    <ShieldAlertIcon />
                                    <AlertTitle>
                                      {alert.title} ({alert.level})
                                    </AlertTitle>
                                    <AlertDescription>
                                      {alert.message}
                                    </AlertDescription>
                                  </Alert>
                                ))
                              )}
                            </div>
                          </ScrollArea>
                        </TabsContent>

                        <TabsContent value="routes" className="h-[calc(100%-2.5rem)]">
                          <ScrollArea className="h-full pr-1">
                            <div className="space-y-2 py-1">
                              {selectedSnapshot.routeHotspots.length === 0 ? (
                                <Alert>
                                  <InfoIcon />
                                  <AlertTitle>No Hotspot Route</AlertTitle>
                                  <AlertDescription>
                                    There are no route samples yet for this node.
                                  </AlertDescription>
                                </Alert>
                              ) : (
                                selectedSnapshot.routeHotspots.slice(0, 10).map((route) => (
                                  <Card key={route.path}>
                                    <CardContent className="grid gap-2 pt-4 text-xs">
                                      <div className="flex items-center justify-between gap-2">
                                        <code className="truncate text-[11px]">{route.path}</code>
                                        <span className="text-muted-foreground">
                                          {formatCount(route.count)} req
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-muted-foreground">
                                        <span>error {formatPercent(route.errorRateRatio)}</span>
                                        <span>p95 {formatMs(route.p95LatencyMs)}</span>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))
                              )}
                            </div>
                          </ScrollArea>
                        </TabsContent>

                        <TabsContent value="raw" className="h-[calc(100%-2.5rem)]">
                          <ScrollArea className="h-full rounded-md border bg-muted/35 p-3">
                            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
                              {JSON.stringify(selectedSnapshot.raw, null, 2)}
                            </pre>
                          </ScrollArea>
                        </TabsContent>
                      </Tabs>
                    )}
                  </CardContent>
                </Card>
              </section>
            ) : (
              <section className="h-[calc(100%-11.25rem)]">
                <Card className="h-full">
                  <CardHeader className="flex-row items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">Monitoring Targets</CardTitle>
                      <CardDescription>
                        Edit node labels, base URLs, and monitor switches.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={addTarget}>
                        Add Node
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResetDialogOpen(true)}
                      >
                        <RotateCcwIcon className="size-4" />
                        Restore Default
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="h-[calc(100%-5.5rem)]">
                    <ScrollArea className="h-full pr-1">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {targets.map((target) => (
                          <Card key={target.id}>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm font-medium">
                                {target.id}
                              </CardTitle>
                              <CardDescription>
                                Selected: {selectedTargetId === target.id ? "yes" : "no"}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">
                                  Label
                                </label>
                                <Input
                                  value={target.label}
                                  onChange={(event) =>
                                    updateTarget(target.id, {
                                      label: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground">
                                  Base URL
                                </label>
                                <Input
                                  value={target.baseUrl}
                                  onChange={(event) =>
                                    updateTarget(target.id, {
                                      baseUrl: event.target.value,
                                    })
                                  }
                                />
                              </div>

                              <div className="flex items-center justify-between gap-2 text-xs">
                                <label className="inline-flex items-center gap-2 text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={target.enabled}
                                    onChange={(event) =>
                                      updateTarget(target.id, {
                                        enabled: event.target.checked,
                                      })
                                    }
                                  />
                                  Include in monitoring
                                </label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-rose-600 hover:text-rose-700"
                                  disabled={targets.length <= 1}
                                  onClick={() => setPendingDeleteTargetId(target.id)}
                                >
                                  <Trash2Icon className="size-4" />
                                  Delete
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </section>
            )}
          </main>
        </div>
      </SidebarInset>

      <AlertDialog
        open={Boolean(pendingDeleteTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteTargetId(null)
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Target?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{pendingDeleteTarget?.label || pendingDeleteTargetId}</strong>
              {" "}
              from monitoring targets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemoveTarget}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Default Targets?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite current target configuration with default nodes:
              alex.telagent.org and bess.telagent.org.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetDefaults}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sonner position="top-right" richColors closeButton />
    </SidebarProvider>
  )
}
