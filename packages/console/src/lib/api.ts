import { assessHealth } from './format';
import type {
  EndpointKey,
  IdentitySelf,
  MonitoringAlert,
  NodeAuditSnapshot,
  NodeMetricsSnapshot,
  NodeOverview,
  NodeTarget,
  OwnerNodeSnapshot,
  RouteMetric,
} from './types';

interface SnapshotOptions {
  timeoutMs?: number;
  auditSampleSize?: number;
  retractionScanLimit?: number;
  fetchImpl?: typeof fetch;
}

interface EndpointResult<T> {
  key: EndpointKey;
  data?: T;
  latencyMs?: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 6500;
const DEFAULT_AUDIT_SAMPLE_SIZE = 6;
const DEFAULT_RETRACTION_SCAN_LIMIT = 2500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function fetchEnvelopeData<T>(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ data: T; latencyMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetchImpl(toUrl(baseUrl, path), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, application/problem+json',
      },
    });

    const bodyText = await response.text();
    const latencyMs = performance.now() - startedAt;

    let parsed: unknown = null;
    if (bodyText.trim()) {
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = bodyText;
      }
    }

    if (!response.ok) {
      if (isRecord(parsed)) {
        const code = readString(parsed.code);
        const detail = readString(parsed.detail);
        const title = readString(parsed.title);
        const problemText = detail || title || response.statusText;
        throw new Error(`${response.status}${code ? ` ${code}` : ''}: ${problemText}`);
      }
      throw new Error(`${response.status}: ${response.statusText || 'request failed'}`);
    }

    if (!isRecord(parsed) || !('data' in parsed)) {
      throw new Error('invalid response envelope: missing data field');
    }
    const envelope = parsed as { data: unknown };

    return {
      data: envelope.data as T,
      latencyMs,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`request timeout after ${timeoutMs}ms`);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(String(error));
  } finally {
    clearTimeout(timeout);
  }
}

async function readEndpoint<T>(
  key: EndpointKey,
  baseUrl: string,
  path: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<EndpointResult<T>> {
  try {
    const response = await fetchEnvelopeData<T>(baseUrl, path, timeoutMs, fetchImpl);
    return {
      key,
      data: response.data,
      latencyMs: response.latencyMs,
    };
  } catch (error) {
    return {
      key,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeAlerts(input: unknown): MonitoringAlert[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: MonitoringAlert[] = [];
  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }

    const levelRaw = readString(item.level).toUpperCase();
    const level = levelRaw === 'CRITICAL' || levelRaw === 'WARN' || levelRaw === 'OK'
      ? levelRaw
      : 'WARN';

    normalized.push({
      code: readString(item.code) || 'UNKNOWN',
      level,
      title: readString(item.title) || 'Unnamed Alert',
      value: readNumber(item.value),
      threshold: readNumber(item.threshold),
      message: readString(item.message) || '-',
    });
  }

  return normalized;
}

function normalizeRoutes(input: unknown): RouteMetric[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: RouteMetric[] = [];
  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }

    const path = readString(item.path);
    if (!path) {
      continue;
    }

    normalized.push({
      path,
      count: Math.max(0, Math.floor(readNumber(item.count))),
      errorRateRatio: Math.max(0, readNumber(item.errorRateRatio)),
      avgLatencyMs: Math.max(0, readNumber(item.avgLatencyMs)),
      p95LatencyMs: Math.max(0, readNumber(item.p95LatencyMs)),
      lastStatus: Math.max(0, Math.floor(readNumber(item.lastStatus))),
      lastSeenAt: readString(item.lastSeenAt),
    });
  }

  return normalized;
}

function readObject(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

export async function loadOwnerNodeSnapshot(
  target: NodeTarget,
  options: SnapshotOptions = {},
): Promise<OwnerNodeSnapshot> {
  const baseUrl = target.baseUrl.trim().replace(/\/+$/, '');
  const nowIso = new Date().toISOString();

  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return {
      target,
      fetchedAt: nowIso,
      totalLatencyMs: 0,
      latencies: {},
      health: {
        level: 'offline',
        score: 0,
        reasons: ['base URL 非法或为空'],
      },
      serviceVersion: null,
      identityDid: null,
      identityDidHash: null,
      criticalAlerts: 0,
      warnAlerts: 0,
      errorRateRatio: 0,
      p95LatencyMs: 0,
      mailboxStaleSec: 0,
      routeHotspots: [],
      alerts: [],
      errors: ['invalid base URL'],
      raw: {},
    };
  }

  const timeoutMs = Math.max(1000, Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const auditSampleSize = Math.max(1, Math.min(100, Math.floor(options.auditSampleSize ?? DEFAULT_AUDIT_SAMPLE_SIZE)));
  const retractionScanLimit = Math.max(
    100,
    Math.min(100_000, Math.floor(options.retractionScanLimit ?? DEFAULT_RETRACTION_SCAN_LIMIT)),
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  const [nodeResult, metricsResult, auditResult, identityResult] = await Promise.all([
    readEndpoint<NodeOverview>('node', baseUrl, '/api/v1/node', timeoutMs, fetchImpl),
    readEndpoint<NodeMetricsSnapshot>('metrics', baseUrl, '/api/v1/node/metrics', timeoutMs, fetchImpl),
    readEndpoint<NodeAuditSnapshot>(
      'audit',
      baseUrl,
      `/api/v1/node/audit-snapshot?sample_size=${auditSampleSize}&retraction_scan_limit=${retractionScanLimit}`,
      timeoutMs,
      fetchImpl,
    ),
    readEndpoint<IdentitySelf>('identity', baseUrl, '/api/v1/identities/self', timeoutMs, fetchImpl),
  ]);

  const endpointResults = [nodeResult, metricsResult, auditResult, identityResult];
  const errors = endpointResults
    .filter((result) => Boolean(result.error))
    .map((result) => `${result.key}: ${result.error}`);

  const latencies: Partial<Record<EndpointKey, number>> = {};
  for (const result of endpointResults) {
    if (typeof result.latencyMs === 'number' && Number.isFinite(result.latencyMs)) {
      latencies[result.key] = result.latencyMs;
    }
  }

  const totalLatencyMs = Object.values(latencies).reduce((sum, value) => sum + (value ?? 0), 0);

  const node = nodeResult.data;
  const metrics = metricsResult.data;
  const audit = auditResult.data;
  const identity = identityResult.data;

  const alerts = normalizeAlerts(metrics?.alerts ?? audit?.monitoring?.alerts);
  const criticalAlerts = alerts.filter((alert) => alert.level === 'CRITICAL').length;
  const warnAlerts = alerts.filter((alert) => alert.level === 'WARN').length;

  const routeHotspots = normalizeRoutes(metrics?.routes)
    .sort((left, right) => {
      if (right.errorRateRatio !== left.errorRateRatio) {
        return right.errorRateRatio - left.errorRateRatio;
      }
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return right.p95LatencyMs - left.p95LatencyMs;
    })
    .slice(0, 8);

  const totals = readObject(metrics?.totals ?? audit?.monitoring?.totals);
  const mailbox = readObject(metrics?.mailboxMaintenance ?? audit?.monitoring?.mailboxMaintenance);

  const errorRateRatio = Math.max(0, readNumber(totals.errorRateRatio));
  const p95LatencyMs = Math.max(0, readNumber(totals.p95LatencyMs));
  const mailboxStaleSec = Math.max(0, readNumber(mailbox.staleSec));

  const health = assessHealth({
    endpointFailures: errors.length,
    criticalAlerts,
    warnAlerts,
    errorRateRatio,
    p95LatencyMs,
    mailboxStaleSec,
  });

  return {
    target,
    fetchedAt: nowIso,
    totalLatencyMs,
    latencies,
    health,
    serviceVersion: readString(node?.version) || null,
    identityDid: readString(identity?.did) || null,
    identityDidHash: readString(identity?.didHash) || null,
    criticalAlerts,
    warnAlerts,
    errorRateRatio,
    p95LatencyMs,
    mailboxStaleSec,
    routeHotspots,
    alerts,
    errors,
    raw: {
      node,
      metrics,
      audit,
      identity,
    },
  };
}
