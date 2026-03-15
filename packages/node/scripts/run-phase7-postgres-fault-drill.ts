import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { MessageService } from '../src/services/message-service.js';
import { PostgresMessageRepository } from '../src/storage/postgres-message-repository.js';

const execFileAsync = promisify(execFile);

interface P7FaultDrillReport {
  phase: 'Phase 7';
  taskId: 'TA-P7-003';
  generatedAt: string;
  config: {
    pgUrl: string;
    schema: string;
    container: string;
    waitTimeoutSec: number;
  };
  summary: {
    restartCommandSucceeded: boolean;
    restartDurationMs: number;
    persistedAcrossRestart: boolean;
    sequenceContinuesAfterRestart: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function redactPgUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return 'postgres://***';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForRepositoryReady(
  connectionString: string,
  schema: string,
  timeoutMs: number,
): Promise<{ attempts: number; elapsedMs: number }> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    attempts++;
    const repository = new PostgresMessageRepository({
      connectionString,
      schema,
      ssl: false,
      maxConnections: 2,
    });
    try {
      await repository.init();
      await repository.close();
      return {
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
      await repository.close().catch(() => undefined);
      await sleep(1_000);
    }
  }

  throw new Error(
    `waitForRepositoryReady timeout after ${timeoutMs}ms: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  const pgUrl = process.env.P7_PG_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/telagent_p7?connect_timeout=3';
  const schema = process.env.P7_FAULT_PG_SCHEMA ?? `phase7_fault_drill_${runId}`;
  const container = process.env.P7_FAULT_DOCKER_CONTAINER ?? 'telagent-p7-postgres';
  const waitTimeoutSec = Number.parseInt(process.env.P7_FAULT_WAIT_TIMEOUT_SEC ?? '60', 10);
  const outputPath = process.env.P7_FAULT_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-7/manifests/2026-03-03-p7-postgres-fault-drill.json');

  const firstRepo = new PostgresMessageRepository({
    connectionString: pgUrl,
    schema,
    ssl: false,
    maxConnections: 4,
  });
  await firstRepo.init();
  const firstService = new MessageService({} as never, { repository: firstRepo });
  const conversationId = 'direct:phase7-fault';
  const firstEnvelope = await firstService.send({
    envelopeId: 'p7-fault-env-1',
    senderDid: 'did:claw:zPhase7',
    conversationId,
    conversationType: 'direct',
    targetDomain: 'phase7.tel',
    mailboxKeyId: 'mailbox-phase7',
    sealedHeader: '0x701',
    ciphertext: '0x801',
    contentType: 'text',
    ttlSec: 86_400,
  });
  await firstRepo.close();

  const restartStartedAt = Date.now();
  let restartCommandSucceeded = false;
  let restartStdout = '';
  let restartStderr = '';
  try {
    const result = await execFileAsync('docker', ['restart', container]);
    restartStdout = result.stdout?.trim() ?? '';
    restartStderr = result.stderr?.trim() ?? '';
    restartCommandSucceeded = true;
  } catch (error) {
    restartStderr = error instanceof Error ? error.message : String(error);
  }
  const restartDurationMs = Date.now() - restartStartedAt;

  let readyResult: { attempts: number; elapsedMs: number } | null = null;
  if (restartCommandSucceeded) {
    readyResult = await waitForRepositoryReady(pgUrl, schema, waitTimeoutSec * 1000);
  }

  const secondRepo = new PostgresMessageRepository({
    connectionString: pgUrl,
    schema,
    ssl: false,
    maxConnections: 4,
  });
  await secondRepo.init();
  const secondService = new MessageService({} as never, { repository: secondRepo });

  const pulled = await secondService.pull({
    conversationId,
    limit: 20,
  });
  const secondEnvelope = await secondService.send({
    envelopeId: 'p7-fault-env-2',
    senderDid: 'did:claw:zPhase7',
    conversationId,
    conversationType: 'direct',
    targetDomain: 'phase7.tel',
    mailboxKeyId: 'mailbox-phase7',
    sealedHeader: '0x702',
    ciphertext: '0x802',
    contentType: 'text',
    ttlSec: 86_400,
  });
  await secondRepo.close();

  const persistedAcrossRestart = pulled.items.some((item) => item.envelopeId === firstEnvelope.envelopeId);
  const sequenceContinuesAfterRestart = secondEnvelope.seq === 2n;

  const report: P7FaultDrillReport = {
    phase: 'Phase 7',
    taskId: 'TA-P7-003',
    generatedAt: new Date().toISOString(),
    config: {
      pgUrl: redactPgUrl(pgUrl),
      schema,
      container,
      waitTimeoutSec,
    },
    summary: {
      restartCommandSucceeded,
      restartDurationMs,
      persistedAcrossRestart,
      sequenceContinuesAfterRestart,
    },
    decision:
      restartCommandSucceeded
        && persistedAcrossRestart
        && sequenceContinuesAfterRestart
        ? 'PASS'
        : 'FAIL',
    details: {
      restartStdout,
      restartStderr,
      waitForReady: readyResult,
      pulledCountAfterRestart: pulled.items.length,
      firstSeq: firstEnvelope.seq.toString(),
      secondSeq: secondEnvelope.seq.toString(),
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P7-003] restartCommandSucceeded=${report.summary.restartCommandSucceeded} restartDurationMs=${report.summary.restartDurationMs}`);
  console.log(`[TA-P7-003] persistedAcrossRestart=${report.summary.persistedAcrossRestart} sequenceContinuesAfterRestart=${report.summary.sequenceContinuesAfterRestart}`);
  console.log(`[TA-P7-003] decision=${report.decision}`);
  console.log(`[TA-P7-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 7 fault drill failed');
  }
}

main().catch((error) => {
  console.error('[TA-P7-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});
