import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { ChainConfigSchema, type ChainConfig } from './services/chain-config.js';

export interface FederationConfig {
  selfDomain: string;
  authToken?: string;
  allowedSourceDomains: string[];
  protocolVersion: string;
  supportedProtocolVersions: string[];
  envelopeRateLimitPerMinute: number;
  groupStateSyncRateLimitPerMinute: number;
  receiptRateLimitPerMinute: number;
  replayBackoffBaseMs: number;
  replayBackoffMaxMs: number;
  replayCircuitBreakerFailureThreshold: number;
  replayCircuitBreakerCooldownSec: number;
  pinningMode: FederationPinningMode;
  pinningCurrentKeysByDomain: Record<string, string[]>;
  pinningNextKeysByDomain: Record<string, string[]>;
  pinningCutoverAtMs?: number;
}

export interface MonitoringConfig {
  errorRateWarnRatio: number;
  errorRateCriticalRatio: number;
  requestP95WarnMs: number;
  requestP95CriticalMs: number;
  maintenanceStaleWarnSec: number;
  maintenanceStaleCriticalSec: number;
  federationDlqErrorBudgetRatio: number;
  federationDlqBurnRateWarn: number;
  federationDlqBurnRateCritical: number;
}

export type FederationPinningMode = 'disabled' | 'enforced' | 'report-only';

export type MailboxStoreBackend = 'sqlite' | 'postgres';

export interface MailboxStoreConfig {
  backend: MailboxStoreBackend;
  sqlitePath: string;
  postgres?: {
    connectionString: string;
    schema: string;
    ssl: boolean;
    maxConnections: number;
  };
}

export type DomainProofMode = 'enforced' | 'report-only';

export interface DomainProofConfig {
  mode: DomainProofMode;
  challengeTtlSec: number;
  rotateBeforeExpirySec: number;
  requestTimeoutMs: number;
}

export interface FederationSloConfig {
  replayIntervalSec: number;
  replayBatchSize: number;
  replayStopOnError: boolean;
}

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  mailboxCleanupIntervalSec: number;
  mailboxStore: MailboxStoreConfig;
  chain: ChainConfig;
  federation: FederationConfig;
  monitoring: MonitoringConfig;
  domainProof: DomainProofConfig;
  federationSlo: FederationSloConfig;
}

export function loadConfigFromEnv(): AppConfig {
  const host = process.env.TELAGENT_API_HOST || '127.0.0.1';
  const port = Number(process.env.TELAGENT_API_PORT || 9528);
  const dataDir = process.env.TELAGENT_DATA_DIR || '.telagent';
  mkdirSync(dataDir, { recursive: true });

  const chain = ChainConfigSchema.parse({
    rpcUrl: process.env.TELAGENT_CHAIN_RPC_URL,
    chainId: Number(process.env.TELAGENT_CHAIN_ID || 7625),
    contracts: {
      identity: process.env.TELAGENT_IDENTITY_CONTRACT,
      token: process.env.TELAGENT_TOKEN_CONTRACT,
      router: process.env.TELAGENT_ROUTER_CONTRACT,
      telagentGroupRegistry: process.env.TELAGENT_GROUP_REGISTRY_CONTRACT,
    },
    signer: {
      type: process.env.TELAGENT_SIGNER_TYPE || 'env',
      envVar: process.env.TELAGENT_SIGNER_ENV || 'TELAGENT_PRIVATE_KEY',
      path: process.env.TELAGENT_SIGNER_PATH,
      index: Number(process.env.TELAGENT_SIGNER_INDEX || 0),
    },
    selfDid: process.env.TELAGENT_SELF_DID,
    finalityDepth: Number(process.env.TELAGENT_FINALITY_DEPTH || 12),
  });

  const allowedSourceDomains = (process.env.TELAGENT_FEDERATION_ALLOWED_DOMAINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const federationProtocolVersion = (process.env.TELAGENT_FEDERATION_PROTOCOL_VERSION || 'v1').trim().toLowerCase();
  const supportedProtocolVersions = (process.env.TELAGENT_FEDERATION_SUPPORTED_PROTOCOLS || federationProtocolVersion)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!supportedProtocolVersions.includes(federationProtocolVersion)) {
    supportedProtocolVersions.unshift(federationProtocolVersion);
  }

  const mailboxStoreBackend = (
    process.env.TELAGENT_MAILBOX_STORE_BACKEND?.trim().toLowerCase() || 'sqlite'
  ) as MailboxStoreBackend;
  if (mailboxStoreBackend !== 'sqlite' && mailboxStoreBackend !== 'postgres') {
    throw new Error('TELAGENT_MAILBOX_STORE_BACKEND must be sqlite or postgres');
  }

  const mailboxStore: MailboxStoreConfig = {
    backend: mailboxStoreBackend,
    sqlitePath: process.env.TELAGENT_MAILBOX_SQLITE_PATH || resolveDataPath(dataDir, 'mailbox.sqlite'),
  };

  if (mailboxStoreBackend === 'postgres') {
    const connectionString = process.env.TELAGENT_MAILBOX_PG_URL;
    if (!connectionString || !connectionString.trim()) {
      throw new Error('TELAGENT_MAILBOX_PG_URL is required when TELAGENT_MAILBOX_STORE_BACKEND=postgres');
    }

    mailboxStore.postgres = {
      connectionString: connectionString.trim(),
      schema: process.env.TELAGENT_MAILBOX_PG_SCHEMA || 'public',
      ssl: parseBoolean(process.env.TELAGENT_MAILBOX_PG_SSL, false),
      maxConnections: Number(process.env.TELAGENT_MAILBOX_PG_MAX_CONN || 10),
    };
  }

  const federationPinningMode = parseFederationPinningMode(process.env.TELAGENT_FEDERATION_PINNING_MODE);
  const federationPinningCurrentKeysByDomain = parsePinnedKeyMap(
    process.env.TELAGENT_FEDERATION_PINNING_CURRENT_KEYS,
    'TELAGENT_FEDERATION_PINNING_CURRENT_KEYS',
  );
  const federationPinningNextKeysByDomain = parsePinnedKeyMap(
    process.env.TELAGENT_FEDERATION_PINNING_NEXT_KEYS,
    'TELAGENT_FEDERATION_PINNING_NEXT_KEYS',
  );
  const federationPinningCutoverAtMs = parseOptionalTimestampMs(
    process.env.TELAGENT_FEDERATION_PINNING_CUTOVER_AT,
    'TELAGENT_FEDERATION_PINNING_CUTOVER_AT',
  );
  if (
    federationPinningMode !== 'disabled'
    && Object.keys(federationPinningCurrentKeysByDomain).length === 0
    && Object.keys(federationPinningNextKeysByDomain).length === 0
  ) {
    throw new Error(
      'federation pinning requires TELAGENT_FEDERATION_PINNING_CURRENT_KEYS or TELAGENT_FEDERATION_PINNING_NEXT_KEYS',
    );
  }

  return {
    host,
    port,
    dataDir,
    mailboxCleanupIntervalSec: Number(process.env.TELAGENT_MAILBOX_CLEANUP_INTERVAL_SEC || 60),
    mailboxStore,
    chain,
    federation: {
      selfDomain: process.env.TELAGENT_FEDERATION_SELF_DOMAIN || host,
      authToken: process.env.TELAGENT_FEDERATION_AUTH_TOKEN || undefined,
      allowedSourceDomains,
      protocolVersion: federationProtocolVersion,
      supportedProtocolVersions,
      envelopeRateLimitPerMinute: Number(process.env.TELAGENT_FEDERATION_ENVELOPE_RATE_LIMIT_PER_MIN || 600),
      groupStateSyncRateLimitPerMinute: Number(process.env.TELAGENT_FEDERATION_SYNC_RATE_LIMIT_PER_MIN || 300),
      receiptRateLimitPerMinute: Number(process.env.TELAGENT_FEDERATION_RECEIPT_RATE_LIMIT_PER_MIN || 600),
      replayBackoffBaseMs: parsePositiveInteger(
        process.env.TELAGENT_FEDERATION_REPLAY_BACKOFF_BASE_MS,
        1_000,
        'TELAGENT_FEDERATION_REPLAY_BACKOFF_BASE_MS',
      ),
      replayBackoffMaxMs: parsePositiveInteger(
        process.env.TELAGENT_FEDERATION_REPLAY_BACKOFF_MAX_MS,
        60_000,
        'TELAGENT_FEDERATION_REPLAY_BACKOFF_MAX_MS',
      ),
      replayCircuitBreakerFailureThreshold: parsePositiveInteger(
        process.env.TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_FAIL_THRESHOLD,
        3,
        'TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_FAIL_THRESHOLD',
      ),
      replayCircuitBreakerCooldownSec: parsePositiveInteger(
        process.env.TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_COOLDOWN_SEC,
        30,
        'TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_COOLDOWN_SEC',
      ),
      pinningMode: federationPinningMode,
      pinningCurrentKeysByDomain: federationPinningCurrentKeysByDomain,
      pinningNextKeysByDomain: federationPinningNextKeysByDomain,
      pinningCutoverAtMs: federationPinningCutoverAtMs,
    },
    monitoring: {
      errorRateWarnRatio: Number(process.env.TELAGENT_MONITOR_ERROR_RATE_WARN_RATIO || 0.02),
      errorRateCriticalRatio: Number(process.env.TELAGENT_MONITOR_ERROR_RATE_CRITICAL_RATIO || 0.05),
      requestP95WarnMs: Number(process.env.TELAGENT_MONITOR_REQ_P95_WARN_MS || 250),
      requestP95CriticalMs: Number(process.env.TELAGENT_MONITOR_REQ_P95_CRITICAL_MS || 500),
      maintenanceStaleWarnSec: Number(process.env.TELAGENT_MONITOR_MAINT_STALE_WARN_SEC || 180),
      maintenanceStaleCriticalSec: Number(process.env.TELAGENT_MONITOR_MAINT_STALE_CRITICAL_SEC || 300),
      federationDlqErrorBudgetRatio: parsePositiveNumber(
        process.env.TELAGENT_MONITOR_FED_DLQ_ERROR_BUDGET_RATIO,
        0.01,
        'TELAGENT_MONITOR_FED_DLQ_ERROR_BUDGET_RATIO',
      ),
      federationDlqBurnRateWarn: parsePositiveNumber(
        process.env.TELAGENT_MONITOR_FED_DLQ_BURN_RATE_WARN,
        2,
        'TELAGENT_MONITOR_FED_DLQ_BURN_RATE_WARN',
      ),
      federationDlqBurnRateCritical: parsePositiveNumber(
        process.env.TELAGENT_MONITOR_FED_DLQ_BURN_RATE_CRITICAL,
        5,
        'TELAGENT_MONITOR_FED_DLQ_BURN_RATE_CRITICAL',
      ),
    },
    domainProof: {
      mode: parseDomainProofMode(process.env.TELAGENT_DOMAIN_PROOF_MODE),
      challengeTtlSec: parsePositiveInteger(process.env.TELAGENT_DOMAIN_PROOF_CHALLENGE_TTL_SEC, 86_400, 'TELAGENT_DOMAIN_PROOF_CHALLENGE_TTL_SEC'),
      rotateBeforeExpirySec: parsePositiveInteger(
        process.env.TELAGENT_DOMAIN_PROOF_ROTATE_BEFORE_EXPIRY_SEC,
        900,
        'TELAGENT_DOMAIN_PROOF_ROTATE_BEFORE_EXPIRY_SEC',
      ),
      requestTimeoutMs: parsePositiveInteger(
        process.env.TELAGENT_DOMAIN_PROOF_HTTP_TIMEOUT_MS,
        5_000,
        'TELAGENT_DOMAIN_PROOF_HTTP_TIMEOUT_MS',
      ),
    },
    federationSlo: {
      replayIntervalSec: parsePositiveInteger(
        process.env.TELAGENT_FEDERATION_DLQ_REPLAY_INTERVAL_SEC,
        60,
        'TELAGENT_FEDERATION_DLQ_REPLAY_INTERVAL_SEC',
      ),
      replayBatchSize: parsePositiveInteger(
        process.env.TELAGENT_FEDERATION_DLQ_REPLAY_BATCH_SIZE,
        100,
        'TELAGENT_FEDERATION_DLQ_REPLAY_BATCH_SIZE',
      ),
      replayStopOnError: parseBoolean(process.env.TELAGENT_FEDERATION_DLQ_REPLAY_STOP_ON_ERROR, false),
    },
  };
}

export function resolveDataPath(dataDir: string, filename: string): string {
  return join(dataDir, filename);
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  throw new Error(`invalid boolean value: ${raw}`);
}

function parsePositiveInteger(raw: string | undefined, fallback: number, fieldName: string): number {
  if (typeof raw === 'undefined' || !raw.trim()) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return value;
}

function parsePositiveNumber(raw: string | undefined, fallback: number, fieldName: string): number {
  if (typeof raw === 'undefined' || !raw.trim()) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return value;
}

function parseDomainProofMode(raw: string | undefined): DomainProofMode {
  const normalized = (raw || 'enforced').trim().toLowerCase();
  if (normalized === 'enforced' || normalized === 'report-only') {
    return normalized;
  }
  throw new Error('TELAGENT_DOMAIN_PROOF_MODE must be enforced or report-only');
}

function parseFederationPinningMode(raw: string | undefined): FederationPinningMode {
  const normalized = (raw || 'disabled').trim().toLowerCase();
  if (normalized === 'disabled' || normalized === 'enforced' || normalized === 'report-only') {
    return normalized;
  }
  throw new Error('TELAGENT_FEDERATION_PINNING_MODE must be disabled, enforced, or report-only');
}

function parsePinnedKeyMap(raw: string | undefined, fieldName: string): Record<string, string[]> {
  if (!raw || !raw.trim()) {
    return {};
  }

  const result = new Map<string, Set<string>>();
  const entries = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(`${fieldName} entry must use domain=key1|key2 format`);
    }
    const domain = entry.slice(0, separatorIndex).trim().toLowerCase();
    const keys = entry
      .slice(separatorIndex + 1)
      .split('|')
      .map((key) => key.trim())
      .filter(Boolean);
    if (!domain || keys.length === 0) {
      throw new Error(`${fieldName} entry must provide domain and at least one key`);
    }
    if (!result.has(domain)) {
      result.set(domain, new Set<string>());
    }
    const bucket = result.get(domain)!;
    for (const key of keys) {
      bucket.add(key);
    }
  }

  return Object.fromEntries(
    [...result.entries()].map(([domain, keySet]) => [domain, [...keySet.values()]]),
  );
}

function parseOptionalTimestampMs(raw: string | undefined, fieldName: string): number | undefined {
  if (!raw || !raw.trim()) {
    return undefined;
  }

  const normalized = raw.trim();
  if (/^[0-9]+$/.test(normalized)) {
    const numeric = Number.parseInt(normalized, 10);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error(`${fieldName} must be a positive timestamp`);
    }
    return numeric >= 1_000_000_000_000 ? numeric : numeric * 1_000;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a valid timestamp`);
  }
  return parsed;
}
