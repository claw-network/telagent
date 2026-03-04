export type HealthLevel = 'healthy' | 'degraded' | 'offline';

export interface NodeTarget {
  id: string;
  label: string;
  baseUrl: string;
  enabled: boolean;
}

export interface ApiEnvelope<T> {
  data: T;
  links?: Record<string, string | null | undefined>;
  meta?: unknown;
}

export interface MonitoringAlert {
  code: string;
  level: 'OK' | 'WARN' | 'CRITICAL';
  title: string;
  value: number;
  threshold: number;
  message: string;
}

export interface RouteMetric {
  path: string;
  count: number;
  errorRateRatio: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastStatus: number;
  lastSeenAt: string;
}

export interface NodeMetricsSnapshot {
  generatedAt: string;
  uptimeSec: number;
  totals: {
    requests: number;
    status2xx: number;
    status4xx: number;
    status5xx: number;
    statusOther: number;
    errorRateRatio: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
  routes: RouteMetric[];
  mailboxMaintenance: {
    runs: number;
    totalCleanupRemoved: number;
    totalRetracted: number;
    lastRunAt?: string;
    staleSec: number;
  };
  federationDlqReplay: {
    runs: number;
    totalProcessed: number;
    totalReplayed: number;
    totalFailed: number;
    errorBudgetRatio: number;
    burnRate: number;
    lastRunAt?: string;
  };
  alerts: MonitoringAlert[];
  [key: string]: unknown;
}

export interface NodeOverview {
  service: string;
  version: string;
  now: string;
  links?: Record<string, string>;
  [key: string]: unknown;
}

export interface IdentitySelf {
  did: string;
  didHash: string;
  controller?: string;
  isActive?: boolean;
  resolvedAtMs?: number;
  [key: string]: unknown;
}

export interface FederationNodeInfo {
  protocolVersion: string;
  domain: string;
  capabilities: string[];
  security?: {
    authMode?: string;
    allowedSourceDomains?: string[];
    pinning?: {
      mode?: string;
      cutoverReached?: boolean;
    };
  };
  dlq?: {
    pendingCount?: number;
    replayedCount?: number;
  };
  [key: string]: unknown;
}

export interface NodeAuditSnapshot {
  generatedAt: string;
  monitoring?: {
    alerts?: MonitoringAlert[];
    totals?: {
      errorRateRatio?: number;
      p95LatencyMs?: number;
    };
    mailboxMaintenance?: {
      staleSec?: number;
    };
  };
  federation?: {
    dlq?: {
      pendingCount?: number;
    };
  };
  messages?: {
    activeEnvelopeCount?: number;
    isolatedConversationCount?: number;
    revokedDidCount?: number;
  };
  [key: string]: unknown;
}

export interface HealthAssessment {
  level: HealthLevel;
  score: number;
  reasons: string[];
}

export type EndpointKey = 'node' | 'metrics' | 'audit' | 'identity' | 'federation';

export interface OwnerNodeSnapshot {
  target: NodeTarget;
  fetchedAt: string;
  totalLatencyMs: number;
  latencies: Partial<Record<EndpointKey, number>>;
  health: HealthAssessment;
  serviceVersion: string | null;
  identityDid: string | null;
  identityDidHash: string | null;
  federationDomain: string | null;
  capabilities: string[];
  criticalAlerts: number;
  warnAlerts: number;
  errorRateRatio: number;
  p95LatencyMs: number;
  mailboxStaleSec: number;
  dlqPending: number;
  routeHotspots: RouteMetric[];
  alerts: MonitoringAlert[];
  errors: string[];
  raw: {
    node?: NodeOverview;
    metrics?: NodeMetricsSnapshot;
    audit?: NodeAuditSnapshot;
    identity?: IdentitySelf;
    federation?: FederationNodeInfo;
  };
}
