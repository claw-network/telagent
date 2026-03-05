import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfigFromEnv } from './config.js';

const BASE_ENV: Record<string, string> = {
  TELAGENT_API_HOST: '127.0.0.1',
  TELAGENT_API_PORT: '9528',
  TELAGENT_HOME: '.telagent-config-test',
  TELAGENT_CHAIN_RPC_URL: 'http://127.0.0.1:8545',
  TELAGENT_CHAIN_ID: '7625',
  TELAGENT_GROUP_REGISTRY_CONTRACT: '0x3333333333333333333333333333333333333333',
  TELAGENT_SIGNER_TYPE: 'env',
  TELAGENT_SIGNER_ENV: 'TELAGENT_PRIVATE_KEY',
  TELAGENT_PRIVATE_KEY: '0x' + '1'.repeat(64),
};

const DEPRECATED_ENV_KEYS = [
  'TELAGENT_DATA_DIR',
  'TELAGENT_SELF_DID',
  'TELAGENT_IDENTITY_CONTRACT',
  'TELAGENT_TOKEN_CONTRACT',
] as const;

async function withEnv<T>(overrides: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const keys = new Set<string>([
    ...Object.keys(BASE_ENV),
    ...Object.keys(overrides),
    ...DEPRECATED_ENV_KEYS,
  ]);
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
  }

  for (const key of DEPRECATED_ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(BASE_ENV)) {
    process.env[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('mailbox store defaults to sqlite backend', async () => {
  await withEnv(
    {
      TELAGENT_MAILBOX_STORE_BACKEND: undefined,
      TELAGENT_MAILBOX_SQLITE_PATH: undefined,
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.mailboxStore.backend, 'sqlite');
      assert.match(config.mailboxStore.sqlitePath, /mailbox\.sqlite$/);
      assert.equal(config.mailboxStore.postgres, undefined);
    },
  );
});

test('owner config defaults to observer mode', async () => {
  await withEnv(
    {
      TELAGENT_OWNER_MODE: undefined,
      TELAGENT_OWNER_SCOPES: undefined,
      TELAGENT_OWNER_PRIVATE_CONVERSATIONS: undefined,
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.owner.mode, 'observer');
      assert.deepEqual(config.owner.scopes, []);
      assert.deepEqual(config.owner.privateConversations, []);
    },
  );
});

test('owner config parses intervener scopes and private conversations', async () => {
  await withEnv(
    {
      TELAGENT_OWNER_MODE: 'intervener',
      TELAGENT_OWNER_SCOPES: 'send_message,manage_groups,clawnet_market',
      TELAGENT_OWNER_PRIVATE_CONVERSATIONS: 'direct:a,group:b',
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.owner.mode, 'intervener');
      assert.deepEqual(config.owner.scopes, ['send_message', 'manage_groups', 'clawnet_market']);
      assert.deepEqual(config.owner.privateConversations, ['direct:a', 'group:b']);
    },
  );
});

test('owner config rejects unsupported scope', async () => {
  await withEnv(
    {
      TELAGENT_OWNER_MODE: 'intervener',
      TELAGENT_OWNER_SCOPES: 'send_message,unknown_scope',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /unsupported scope/,
      );
    },
  );
});

test('mailbox store parses postgres backend config', async () => {
  await withEnv(
    {
      TELAGENT_MAILBOX_STORE_BACKEND: 'postgres',
      TELAGENT_MAILBOX_PG_URL: 'postgres://user:password@127.0.0.1:5432/telagent',
      TELAGENT_MAILBOX_PG_SCHEMA: 'telagent_mailbox',
      TELAGENT_MAILBOX_PG_SSL: 'true',
      TELAGENT_MAILBOX_PG_MAX_CONN: '16',
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.mailboxStore.backend, 'postgres');
      assert.equal(config.mailboxStore.postgres?.connectionString, 'postgres://user:password@127.0.0.1:5432/telagent');
      assert.equal(config.mailboxStore.postgres?.schema, 'telagent_mailbox');
      assert.equal(config.mailboxStore.postgres?.ssl, true);
      assert.equal(config.mailboxStore.postgres?.maxConnections, 16);
    },
  );
});

test('postgres backend requires connection url', async () => {
  await withEnv(
    {
      TELAGENT_MAILBOX_STORE_BACKEND: 'postgres',
      TELAGENT_MAILBOX_PG_URL: undefined,
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_MAILBOX_PG_URL is required/,
      );
    },
  );
});

test('mailbox backend rejects unsupported value', async () => {
  await withEnv(
    {
      TELAGENT_MAILBOX_STORE_BACKEND: 'redis',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_MAILBOX_STORE_BACKEND must be sqlite or postgres/,
      );
    },
  );
});

test('federation protocol defaults to v1 and supports self version', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_PROTOCOL_VERSION: undefined,
      TELAGENT_FEDERATION_SUPPORTED_PROTOCOLS: undefined,
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.federation.protocolVersion, 'v1');
      assert.deepEqual(config.federation.supportedProtocolVersions, ['v1']);
    },
  );
});

test('federation supported protocols auto-include self version', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_PROTOCOL_VERSION: 'v2',
      TELAGENT_FEDERATION_SUPPORTED_PROTOCOLS: 'v1',
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.federation.protocolVersion, 'v2');
      assert.deepEqual(config.federation.supportedProtocolVersions, ['v2', 'v1']);
    },
  );
});

test('federation replay protection defaults are applied', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_REPLAY_BACKOFF_BASE_MS: undefined,
      TELAGENT_FEDERATION_REPLAY_BACKOFF_MAX_MS: undefined,
      TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_FAIL_THRESHOLD: undefined,
      TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_COOLDOWN_SEC: undefined,
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.federation.replayBackoffBaseMs, 1000);
      assert.equal(config.federation.replayBackoffMaxMs, 60000);
      assert.equal(config.federation.replayCircuitBreakerFailureThreshold, 3);
      assert.equal(config.federation.replayCircuitBreakerCooldownSec, 30);
    },
  );
});

test('federation replay protection accepts custom values', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_REPLAY_BACKOFF_BASE_MS: '500',
      TELAGENT_FEDERATION_REPLAY_BACKOFF_MAX_MS: '15000',
      TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_FAIL_THRESHOLD: '4',
      TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_COOLDOWN_SEC: '45',
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.federation.replayBackoffBaseMs, 500);
      assert.equal(config.federation.replayBackoffMaxMs, 15000);
      assert.equal(config.federation.replayCircuitBreakerFailureThreshold, 4);
      assert.equal(config.federation.replayCircuitBreakerCooldownSec, 45);
    },
  );
});

test('federation replay protection requires positive integer values', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_FAIL_THRESHOLD: '0',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_FAIL_THRESHOLD must be a positive integer/,
      );
    },
  );
});

test('domain proof config defaults to enforced mode', async () => {
  await withEnv(
    {
      TELAGENT_DOMAIN_PROOF_MODE: undefined,
      TELAGENT_DOMAIN_PROOF_CHALLENGE_TTL_SEC: undefined,
      TELAGENT_DOMAIN_PROOF_ROTATE_BEFORE_EXPIRY_SEC: undefined,
      TELAGENT_DOMAIN_PROOF_HTTP_TIMEOUT_MS: undefined,
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.domainProof.mode, 'enforced');
      assert.equal(config.domainProof.challengeTtlSec, 86_400);
      assert.equal(config.domainProof.rotateBeforeExpirySec, 900);
      assert.equal(config.domainProof.requestTimeoutMs, 5_000);
    },
  );
});

test('domain proof config accepts report-only mode and custom values', async () => {
  await withEnv(
    {
      TELAGENT_DOMAIN_PROOF_MODE: 'report-only',
      TELAGENT_DOMAIN_PROOF_CHALLENGE_TTL_SEC: '7200',
      TELAGENT_DOMAIN_PROOF_ROTATE_BEFORE_EXPIRY_SEC: '300',
      TELAGENT_DOMAIN_PROOF_HTTP_TIMEOUT_MS: '2500',
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.domainProof.mode, 'report-only');
      assert.equal(config.domainProof.challengeTtlSec, 7200);
      assert.equal(config.domainProof.rotateBeforeExpirySec, 300);
      assert.equal(config.domainProof.requestTimeoutMs, 2500);
    },
  );
});

test('domain proof mode rejects unsupported value', async () => {
  await withEnv(
    {
      TELAGENT_DOMAIN_PROOF_MODE: 'disabled',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_DOMAIN_PROOF_MODE must be enforced or report-only/,
      );
    },
  );
});

test('domain proof numeric settings require positive integers', async () => {
  await withEnv(
    {
      TELAGENT_DOMAIN_PROOF_CHALLENGE_TTL_SEC: '0',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_DOMAIN_PROOF_CHALLENGE_TTL_SEC must be a positive integer/,
      );
    },
  );
});

test('federation pinning defaults to disabled mode', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_PINNING_MODE: undefined,
      TELAGENT_FEDERATION_PINNING_CURRENT_KEYS: undefined,
      TELAGENT_FEDERATION_PINNING_NEXT_KEYS: undefined,
      TELAGENT_FEDERATION_PINNING_CUTOVER_AT: undefined,
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.federation.pinningMode, 'disabled');
      assert.deepEqual(config.federation.pinningCurrentKeysByDomain, {});
      assert.deepEqual(config.federation.pinningNextKeysByDomain, {});
      assert.equal(config.federation.pinningCutoverAtMs, undefined);
    },
  );
});

test('federation pinning parses current/next keys and cutover timestamp', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_PINNING_MODE: 'enforced',
      TELAGENT_FEDERATION_PINNING_CURRENT_KEYS: 'node-b.tel=node-b-key-v1|node-b-key-v1,node-c.tel=node-c-key-v1',
      TELAGENT_FEDERATION_PINNING_NEXT_KEYS: 'node-b.tel=node-b-key-v2',
      TELAGENT_FEDERATION_PINNING_CUTOVER_AT: '2026-03-10T09:00:00Z',
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.federation.pinningMode, 'enforced');
      assert.deepEqual(config.federation.pinningCurrentKeysByDomain, {
        'node-b.tel': ['node-b-key-v1'],
        'node-c.tel': ['node-c-key-v1'],
      });
      assert.deepEqual(config.federation.pinningNextKeysByDomain, {
        'node-b.tel': ['node-b-key-v2'],
      });
      assert.equal(config.federation.pinningCutoverAtMs, Date.parse('2026-03-10T09:00:00Z'));
    },
  );
});

test('federation pinning rejects invalid mode', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_PINNING_MODE: 'strict',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_FEDERATION_PINNING_MODE must be disabled, enforced, or report-only/,
      );
    },
  );
});

test('federation pinning enabled requires key mappings', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_PINNING_MODE: 'enforced',
      TELAGENT_FEDERATION_PINNING_CURRENT_KEYS: undefined,
      TELAGENT_FEDERATION_PINNING_NEXT_KEYS: undefined,
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /federation pinning requires TELAGENT_FEDERATION_PINNING_CURRENT_KEYS or TELAGENT_FEDERATION_PINNING_NEXT_KEYS/,
      );
    },
  );
});

test('federation pinning map requires domain=keys format', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_PINNING_MODE: 'report-only',
      TELAGENT_FEDERATION_PINNING_CURRENT_KEYS: 'node-b.tel',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_FEDERATION_PINNING_CURRENT_KEYS entry must use domain=key1\|key2 format/,
      );
    },
  );
});

test('federation SLO automation config defaults are applied', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_DLQ_REPLAY_INTERVAL_SEC: undefined,
      TELAGENT_FEDERATION_DLQ_REPLAY_BATCH_SIZE: undefined,
      TELAGENT_FEDERATION_DLQ_REPLAY_STOP_ON_ERROR: undefined,
      TELAGENT_MONITOR_FED_DLQ_ERROR_BUDGET_RATIO: undefined,
      TELAGENT_MONITOR_FED_DLQ_BURN_RATE_WARN: undefined,
      TELAGENT_MONITOR_FED_DLQ_BURN_RATE_CRITICAL: undefined,
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.federationSlo.replayIntervalSec, 60);
      assert.equal(config.federationSlo.replayBatchSize, 100);
      assert.equal(config.federationSlo.replayStopOnError, false);
      assert.equal(config.monitoring.federationDlqErrorBudgetRatio, 0.01);
      assert.equal(config.monitoring.federationDlqBurnRateWarn, 2);
      assert.equal(config.monitoring.federationDlqBurnRateCritical, 5);
    },
  );
});

test('federation SLO automation config accepts custom values', async () => {
  await withEnv(
    {
      TELAGENT_FEDERATION_DLQ_REPLAY_INTERVAL_SEC: '15',
      TELAGENT_FEDERATION_DLQ_REPLAY_BATCH_SIZE: '42',
      TELAGENT_FEDERATION_DLQ_REPLAY_STOP_ON_ERROR: 'true',
      TELAGENT_MONITOR_FED_DLQ_ERROR_BUDGET_RATIO: '0.02',
      TELAGENT_MONITOR_FED_DLQ_BURN_RATE_WARN: '1.5',
      TELAGENT_MONITOR_FED_DLQ_BURN_RATE_CRITICAL: '4.5',
    },
    async () => {
      const config = loadConfigFromEnv();
      assert.equal(config.federationSlo.replayIntervalSec, 15);
      assert.equal(config.federationSlo.replayBatchSize, 42);
      assert.equal(config.federationSlo.replayStopOnError, true);
      assert.equal(config.monitoring.federationDlqErrorBudgetRatio, 0.02);
      assert.equal(config.monitoring.federationDlqBurnRateWarn, 1.5);
      assert.equal(config.monitoring.federationDlqBurnRateCritical, 4.5);
    },
  );
});

test('federation SLO burn-rate thresholds require positive values', async () => {
  await withEnv(
    {
      TELAGENT_MONITOR_FED_DLQ_BURN_RATE_WARN: '0',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_MONITOR_FED_DLQ_BURN_RATE_WARN must be a positive number/,
      );
    },
  );
});

test('deprecated TELAGENT_DATA_DIR is rejected', async () => {
  await withEnv(
    {
      TELAGENT_DATA_DIR: '.legacy-data-dir',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_DATA_DIR is removed\. Use TELAGENT_HOME instead\./,
      );
    },
  );
});

test('deprecated TELAGENT_SELF_DID is rejected', async () => {
  await withEnv(
    {
      TELAGENT_SELF_DID: 'did:claw:zLegacy',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_SELF_DID is removed\. DID is now obtained from ClawNet Node automatically\./,
      );
    },
  );
});

test('deprecated TELAGENT_IDENTITY_CONTRACT is rejected', async () => {
  await withEnv(
    {
      TELAGENT_IDENTITY_CONTRACT: '0x1111111111111111111111111111111111111111',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_IDENTITY_CONTRACT is removed\. Identity is now resolved via ClawNet SDK\./,
      );
    },
  );
});

test('deprecated TELAGENT_TOKEN_CONTRACT is rejected', async () => {
  await withEnv(
    {
      TELAGENT_TOKEN_CONTRACT: '0x2222222222222222222222222222222222222222',
    },
    async () => {
      assert.throws(
        () => loadConfigFromEnv(),
        /TELAGENT_TOKEN_CONTRACT is removed\. Token balance is now queried via ClawNet SDK\./,
      );
    },
  );
});
