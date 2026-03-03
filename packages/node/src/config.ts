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
}

export interface MonitoringConfig {
  errorRateWarnRatio: number;
  errorRateCriticalRatio: number;
  requestP95WarnMs: number;
  requestP95CriticalMs: number;
  maintenanceStaleWarnSec: number;
  maintenanceStaleCriticalSec: number;
}

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

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  mailboxCleanupIntervalSec: number;
  mailboxStore: MailboxStoreConfig;
  chain: ChainConfig;
  federation: FederationConfig;
  monitoring: MonitoringConfig;
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
    },
    monitoring: {
      errorRateWarnRatio: Number(process.env.TELAGENT_MONITOR_ERROR_RATE_WARN_RATIO || 0.02),
      errorRateCriticalRatio: Number(process.env.TELAGENT_MONITOR_ERROR_RATE_CRITICAL_RATIO || 0.05),
      requestP95WarnMs: Number(process.env.TELAGENT_MONITOR_REQ_P95_WARN_MS || 250),
      requestP95CriticalMs: Number(process.env.TELAGENT_MONITOR_REQ_P95_CRITICAL_MS || 500),
      maintenanceStaleWarnSec: Number(process.env.TELAGENT_MONITOR_MAINT_STALE_WARN_SEC || 180),
      maintenanceStaleCriticalSec: Number(process.env.TELAGENT_MONITOR_MAINT_STALE_CRITICAL_SEC || 300),
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
