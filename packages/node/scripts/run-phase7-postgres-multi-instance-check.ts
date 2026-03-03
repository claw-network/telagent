import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MessageService } from '../src/services/message-service.js';
import { PostgresMessageRepository } from '../src/storage/postgres-message-repository.js';

interface P7MultiInstanceReport {
  phase: 'Phase 7';
  taskId: 'TA-P7-002';
  generatedAt: string;
  config: {
    pgUrl: string;
    schema: string;
    serviceInstances: number;
    totalMessages: number;
    dedupeReplayCount: number;
  };
  summary: {
    pulledCount: number;
    uniqueSeqCount: number;
    duplicateSeqCount: number;
    missingSeqCount: number;
    dedupeReplayHitCount: number;
    dedupeReplayRate: number;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

interface InputRecord {
  envelopeId: string;
  senderDid: string;
  conversationId: string;
  conversationType: 'direct';
  targetDomain: string;
  mailboxKeyId: string;
  sealedHeader: string;
  ciphertext: string;
  contentType: 'text';
  ttlSec: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
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

function buildInput(index: number, conversationId: string): InputRecord {
  return {
    envelopeId: `p7-mi-env-${index.toString().padStart(5, '0')}`,
    senderDid: 'did:claw:zPhase7',
    conversationId,
    conversationType: 'direct',
    targetDomain: 'phase7.tel',
    mailboxKeyId: 'mailbox-phase7',
    sealedHeader: `0x${(index + 1).toString(16)}`,
    ciphertext: `0x${(index + 1000).toString(16)}`,
    contentType: 'text',
    ttlSec: 86_400,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  const pgUrl = process.env.P7_PG_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/telagent_p7?connect_timeout=3';
  const schema = process.env.P7_PG_SCHEMA ?? `phase7_multi_instance_${runId}`;
  const serviceInstances = envInt('P7_MULTI_INSTANCE_COUNT', 3);
  const totalMessages = envInt('P7_MULTI_TOTAL_MESSAGES', 180);
  const dedupeReplayCount = envInt('P7_MULTI_DEDUPE_REPLAY_COUNT', 30);
  const outputPath = process.env.P7_MULTI_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-7/manifests/2026-03-03-p7-postgres-multi-instance-check.json');

  const repositories = Array.from({ length: serviceInstances }, () => new PostgresMessageRepository({
    connectionString: pgUrl,
    schema,
    ssl: false,
    maxConnections: 6,
  }));
  const services = repositories.map((repository) => new MessageService({} as never, { repository }));

  try {
    for (const repository of repositories) {
      await repository.init();
    }

    const conversationId = 'direct:phase7-mi';
    const inputByEnvelopeId = new Map<string, InputRecord>();
    const sentByEnvelopeId = new Map<string, bigint>();
    const sendJobs = Array.from({ length: totalMessages }, (_, offset) => offset + 1).map(async (index) => {
      const service = services[index % services.length];
      const input = buildInput(index, conversationId);
      inputByEnvelopeId.set(input.envelopeId, input);
      const envelope = await service.send(input);
      sentByEnvelopeId.set(envelope.envelopeId, envelope.seq);
      return envelope;
    });
    await Promise.all(sendJobs);

    const replayEnvelopeIds = Array.from(sentByEnvelopeId.keys()).slice(0, Math.min(dedupeReplayCount, totalMessages));
    let dedupeReplayHitCount = 0;
    for (let index = 0; index < replayEnvelopeIds.length; index++) {
      const envelopeId = replayEnvelopeIds[index];
      const replayInput = inputByEnvelopeId.get(envelopeId);
      const expectedSeq = sentByEnvelopeId.get(envelopeId);
      if (!replayInput || expectedSeq == null) {
        continue;
      }

      const replayService = services[(index + 1) % services.length];
      const replayed = await replayService.send(replayInput);
      if (replayed.seq === expectedSeq) {
        dedupeReplayHitCount++;
      }
    }

    const pulled: Array<{ envelopeId: string; seq: bigint }> = [];
    let cursor: string | undefined;
    do {
      const page = await services[0].pull({
        conversationId,
        limit: 100,
        cursor,
      });
      pulled.push(...page.items.map((item) => ({
        envelopeId: item.envelopeId,
        seq: item.seq,
      })));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    const seqValues = pulled
      .map((item) => Number(item.seq))
      .filter((value) => Number.isFinite(value));
    const seqSet = new Set(seqValues.map((value) => String(value)));
    const uniqueSeqCount = seqSet.size;
    const duplicateSeqCount = pulled.length - uniqueSeqCount;
    const minSeq = seqValues.length > 0 ? Math.min(...seqValues) : 0;
    const maxSeq = seqValues.length > 0 ? Math.max(...seqValues) : 0;

    const missingSeq: number[] = [];
    for (let seq = 1; seq <= maxSeq; seq++) {
      if (!seqSet.has(String(seq))) {
        missingSeq.push(seq);
      }
    }

    const report: P7MultiInstanceReport = {
      phase: 'Phase 7',
      taskId: 'TA-P7-002',
      generatedAt: new Date().toISOString(),
      config: {
        pgUrl: redactPgUrl(pgUrl),
        schema,
        serviceInstances,
        totalMessages,
        dedupeReplayCount: replayEnvelopeIds.length,
      },
      summary: {
        pulledCount: pulled.length,
        uniqueSeqCount,
        duplicateSeqCount,
        missingSeqCount: missingSeq.length,
        dedupeReplayHitCount,
        dedupeReplayRate: replayEnvelopeIds.length > 0 ? dedupeReplayHitCount / replayEnvelopeIds.length : 1,
      },
      decision:
        pulled.length === totalMessages
          && duplicateSeqCount === 0
          && missingSeq.length === 0
          && dedupeReplayHitCount === replayEnvelopeIds.length
          ? 'PASS'
          : 'FAIL',
      details: {
        minSeq,
        maxSeq,
        replayEnvelopeIds,
        missingSeq,
      },
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    console.log(`[TA-P7-002] pulled=${report.summary.pulledCount} uniqueSeq=${report.summary.uniqueSeqCount} missingSeq=${report.summary.missingSeqCount}`);
    console.log(`[TA-P7-002] dedupeReplay=${report.summary.dedupeReplayHitCount}/${report.config.dedupeReplayCount}`);
    console.log(`[TA-P7-002] decision=${report.decision}`);
    console.log(`[TA-P7-002] output=${outputPath}`);

    if (report.decision !== 'PASS') {
      throw new Error('Phase 7 multi-instance check failed');
    }
  } finally {
    await Promise.allSettled(repositories.map((repository) => repository.close()));
  }
}

main().catch((error) => {
  console.error('[TA-P7-002] execution failed');
  console.error(error);
  process.exitCode = 1;
});
