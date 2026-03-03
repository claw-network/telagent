import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfigFromEnv } from './config.js';

const BASE_ENV: Record<string, string> = {
  TELAGENT_API_HOST: '127.0.0.1',
  TELAGENT_API_PORT: '9528',
  TELAGENT_DATA_DIR: '.telagent-config-test',
  TELAGENT_CHAIN_RPC_URL: 'http://127.0.0.1:8545',
  TELAGENT_CHAIN_ID: '7625',
  TELAGENT_IDENTITY_CONTRACT: '0x1111111111111111111111111111111111111111',
  TELAGENT_TOKEN_CONTRACT: '0x2222222222222222222222222222222222222222',
  TELAGENT_GROUP_REGISTRY_CONTRACT: '0x3333333333333333333333333333333333333333',
  TELAGENT_SELF_DID: 'did:claw:zConfig',
  TELAGENT_SIGNER_TYPE: 'env',
  TELAGENT_SIGNER_ENV: 'TELAGENT_PRIVATE_KEY',
  TELAGENT_PRIVATE_KEY: '0x' + '1'.repeat(64),
};

async function withEnv<T>(overrides: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const keys = new Set<string>([...Object.keys(BASE_ENV), ...Object.keys(overrides)]);
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
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
