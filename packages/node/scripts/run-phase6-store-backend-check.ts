import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfigFromEnv } from '../src/config.js';
import { PostgresMessageRepository } from '../src/storage/postgres-message-repository.js';

interface CheckResult {
  id: string;
  passed: boolean;
  details: Record<string, unknown>;
}

interface P6StoreBackendReport {
  phase: 'Phase 6';
  taskId: 'TA-P6-003';
  generatedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  decision: 'PASS' | 'FAIL';
  checks: CheckResult[];
}

const BASE_ENV: Record<string, string> = {
  TELAGENT_API_HOST: '127.0.0.1',
  TELAGENT_API_PORT: '9528',
  TELAGENT_DATA_DIR: '.telagent-phase6-check',
  TELAGENT_CHAIN_RPC_URL: 'http://127.0.0.1:8545',
  TELAGENT_CHAIN_ID: '7625',
  TELAGENT_IDENTITY_CONTRACT: '0x1111111111111111111111111111111111111111',
  TELAGENT_TOKEN_CONTRACT: '0x2222222222222222222222222222222222222222',
  TELAGENT_GROUP_REGISTRY_CONTRACT: '0x3333333333333333333333333333333333333333',
  TELAGENT_SELF_DID: 'did:claw:zRelease',
  TELAGENT_SIGNER_TYPE: 'env',
  TELAGENT_SIGNER_ENV: 'TELAGENT_PRIVATE_KEY',
  TELAGENT_PRIVATE_KEY: '0x' + '1'.repeat(64),
};

async function withEnv<T>(overrides: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const keys = new Set<string>([...Object.keys(BASE_ENV), ...Object.keys(overrides)]);
  const snapshot = new Map<string, string | undefined>();
  for (const key of keys) {
    snapshot.set(key, process.env[key]);
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
      const value = snapshot.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function runCheck(
  id: string,
  check: () => Promise<Record<string, unknown>> | Record<string, unknown>,
): Promise<CheckResult> {
  try {
    const details = await check();
    return {
      id,
      passed: true,
      details,
    };
  } catch (error) {
    return {
      id,
      passed: false,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath =
    process.env.P6_STORE_BACKEND_REPORT_OUTPUT ??
    path.resolve(
      repoRoot,
      'docs/implementation/phase-6/manifests/2026-03-03-p6-store-backend-check.json',
    );

  const checks = await Promise.all([
    runCheck('P6-SB-001', async () => withEnv(
      {
        TELAGENT_MAILBOX_STORE_BACKEND: undefined,
        TELAGENT_MAILBOX_SQLITE_PATH: undefined,
      },
      async () => {
        const config = loadConfigFromEnv();
        if (config.mailboxStore.backend !== 'sqlite') {
          throw new Error('expected sqlite backend by default');
        }
        return {
          backend: config.mailboxStore.backend,
          sqlitePath: config.mailboxStore.sqlitePath,
        };
      },
    )),
    runCheck('P6-SB-002', async () => withEnv(
      {
        TELAGENT_MAILBOX_STORE_BACKEND: 'postgres',
        TELAGENT_MAILBOX_PG_URL: 'postgres://user:password@127.0.0.1:5432/telagent',
        TELAGENT_MAILBOX_PG_SCHEMA: 'telagent_mailbox',
        TELAGENT_MAILBOX_PG_SSL: 'true',
        TELAGENT_MAILBOX_PG_MAX_CONN: '24',
      },
      async () => {
        const config = loadConfigFromEnv();
        if (config.mailboxStore.backend !== 'postgres' || !config.mailboxStore.postgres) {
          throw new Error('postgres backend config not parsed');
        }
        return {
          backend: config.mailboxStore.backend,
          schema: config.mailboxStore.postgres.schema,
          ssl: config.mailboxStore.postgres.ssl,
          maxConnections: config.mailboxStore.postgres.maxConnections,
        };
      },
    )),
    runCheck('P6-SB-003', async () => withEnv(
      {
        TELAGENT_MAILBOX_STORE_BACKEND: 'postgres',
        TELAGENT_MAILBOX_PG_URL: undefined,
      },
      async () => {
        let threw = false;
        try {
          loadConfigFromEnv();
        } catch {
          threw = true;
        }
        if (!threw) {
          throw new Error('expected loadConfigFromEnv to fail without TELAGENT_MAILBOX_PG_URL');
        }
        return {
          threw,
        };
      },
    )),
    runCheck('P6-SB-004', async () => {
      const repo = new PostgresMessageRepository({
        connectionString: 'postgres://user:password@127.0.0.1:5432/telagent',
        schema: 'mailbox_v1',
        maxConnections: 2,
        ssl: false,
      });
      await repo.close();
      return {
        repositoryConstructed: true,
      };
    }),
  ]);

  const passed = checks.filter((check) => check.passed).length;
  const failed = checks.length - passed;

  const report: P6StoreBackendReport = {
    phase: 'Phase 6',
    taskId: 'TA-P6-003',
    generatedAt: new Date().toISOString(),
    summary: {
      total: checks.length,
      passed,
      failed,
    },
    decision: failed === 0 ? 'PASS' : 'FAIL',
    checks,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P6-003] checks=${passed}/${checks.length}`);
  console.log(`[TA-P6-003] decision=${report.decision}`);
  console.log(`[TA-P6-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 6 store backend check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P6-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});
