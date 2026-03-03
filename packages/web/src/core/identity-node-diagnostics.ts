import { keccak256, toUtf8Bytes } from 'ethers';

import { isDidClaw } from './api-client';

const DID_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export type DiagnosticsLevel = 'OK' | 'WARN' | 'CRITICAL';

export interface DidDiagnostics {
  input: string;
  normalizedDid: string;
  isValidDid: boolean;
  method: string | null;
  identifier: string | null;
  didHash: string | null;
  remoteDidHash: string | null;
  hashMatchesRemote: boolean | null;
}

export interface NodeRuntimeDiagnostics {
  level: DiagnosticsLevel;
  service: string | null;
  version: string | null;
  generatedAt: string | null;
  uptimeSec: number | null;
  totalRequests: number | null;
  errorRateRatio: number | null;
  p95LatencyMs: number | null;
  mailboxStaleSec: number | null;
  dlqBurnRate: number | null;
  alertCounts: {
    total: number;
    warn: number;
    critical: number;
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseDid(value: string): {
  method: string | null;
  identifier: string | null;
} {
  const normalized = value.trim();
  const parts = normalized.split(':');
  if (parts.length < 3 || parts[0] !== 'did') {
    return {
      method: null,
      identifier: null,
    };
  }

  const method = parts[1] || null;
  const identifier = parts.slice(2).join(':') || null;
  return {
    method,
    identifier,
  };
}

function normalizeDidHash(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!DID_HASH_PATTERN.test(normalized)) {
    return null;
  }
  return normalized.toLowerCase();
}

export function hashDidKeccakUtf8(did: string): string {
  return keccak256(toUtf8Bytes(did));
}

export function buildDidDiagnostics(inputDid: string, remoteDidHash?: unknown): DidDiagnostics {
  const normalizedDid = typeof inputDid === 'string' ? inputDid.trim() : '';
  const parsed = parseDid(normalizedDid);
  const isValidDid = isDidClaw(normalizedDid);
  const didHash = isValidDid ? hashDidKeccakUtf8(normalizedDid) : null;
  const normalizedRemoteDidHash = normalizeDidHash(remoteDidHash);
  const hashMatchesRemote = didHash && normalizedRemoteDidHash
    ? didHash.toLowerCase() === normalizedRemoteDidHash
    : null;

  return {
    input: inputDid,
    normalizedDid,
    isValidDid,
    method: parsed.method,
    identifier: parsed.identifier,
    didHash,
    remoteDidHash: normalizedRemoteDidHash,
    hashMatchesRemote,
  };
}

export function buildNodeRuntimeDiagnostics(nodeInfoPayload: unknown, nodeMetricsPayload: unknown): NodeRuntimeDiagnostics {
  const nodeInfo = toRecord(nodeInfoPayload);
  const nodeMetrics = toRecord(nodeMetricsPayload);
  const totals = toRecord(nodeMetrics?.totals);
  const mailboxMaintenance = toRecord(nodeMetrics?.mailboxMaintenance);
  const federationDlqReplay = toRecord(nodeMetrics?.federationDlqReplay);
  const alertsRaw = Array.isArray(nodeMetrics?.alerts) ? nodeMetrics.alerts : [];

  let warnCount = 0;
  let criticalCount = 0;

  for (const item of alertsRaw) {
    const level = toStringOrNull(toRecord(item)?.level)?.toUpperCase();
    if (level === 'CRITICAL') {
      criticalCount += 1;
      continue;
    }
    if (level === 'WARN') {
      warnCount += 1;
    }
  }

  const level: DiagnosticsLevel = criticalCount > 0 ? 'CRITICAL' : warnCount > 0 ? 'WARN' : 'OK';

  return {
    level,
    service: toStringOrNull(nodeInfo?.service),
    version: toStringOrNull(nodeInfo?.version),
    generatedAt: toStringOrNull(nodeMetrics?.generatedAt),
    uptimeSec: toNumberOrNull(nodeMetrics?.uptimeSec),
    totalRequests: toNumberOrNull(totals?.requests),
    errorRateRatio: toNumberOrNull(totals?.errorRateRatio),
    p95LatencyMs: toNumberOrNull(totals?.p95LatencyMs),
    mailboxStaleSec: toNumberOrNull(mailboxMaintenance?.staleSec),
    dlqBurnRate: toNumberOrNull(federationDlqReplay?.burnRate),
    alertCounts: {
      total: alertsRaw.length,
      warn: warnCount,
      critical: criticalCount,
    },
  };
}
