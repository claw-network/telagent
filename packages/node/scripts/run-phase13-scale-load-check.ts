import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError, hashDid, type AgentDID } from '@telagent/protocol';

import { MessageService } from '../src/services/message-service.js';

interface Phase13ScaleLoadReport {
  phase: 'Phase 13';
  taskId: 'TA-P13-002';
  generatedAt: string;
  summary: {
    totalMessages: number;
    totalConversations: number;
    throughputMps: number;
    p95SendLatencyMs: number;
    seqMonotonicPass: boolean;
    dedupeStablePass: boolean;
    dedupeConflictPass: boolean;
    throughputPass: boolean;
    latencyPass: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

function createClock(startMs = 1_772_590_100_000): MutableClock {
  let nowMs = startMs;
  return {
    now() {
      return nowMs;
    },
    tick(ms: number) {
      nowMs += ms;
    },
  };
}

class ScaleGroupService {
  private readonly senderDidHash: string;

  constructor(
    private readonly groupIds: string[],
    private readonly senderDid: AgentDID,
    private readonly clock: MutableClock,
  ) {
    this.senderDidHash = hashDid(senderDid);
  }

  getChainState(groupId: string) {
    return {
      groupId,
      state: 'ACTIVE' as const,
      finalizedTxHash: `0x${'a'.repeat(64)}`,
      blockNumber: 100,
      updatedAtMs: this.clock.now(),
    };
  }

  listMembers(groupId: string) {
    return [
      {
        groupId,
        did: this.senderDid,
        didHash: this.senderDidHash,
        state: 'FINALIZED' as const,
        joinedAtMs: this.clock.now(),
      },
    ];
  }

  listGroups() {
    return this.groupIds.map((groupId) => ({ groupId }));
  }
}

class ScaleIdentityService {
  async assertActiveDid(rawDid: string) {
    return {
      did: rawDid,
      didHash: hashDid(rawDid as AgentDID),
      isActive: true,
    };
  }
}

function hex32(seed: string): string {
  return `0x${createHash('sha256').update(seed).digest('hex')}`;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P13_SCALE_LOAD_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-13/manifests/2026-03-03-p13-scale-load-check.json');

  const clock = createClock();
  const senderDid = 'did:claw:zScaleSender' as AgentDID;
  const totalConversations = 40;
  const messagesPerConversation = 80;
  const totalMessages = totalConversations * messagesPerConversation;

  const groupIds = Array.from({ length: totalConversations }, (_, idx) => hex32(`group-${idx}`));
  const conversations = groupIds.map((groupId) => `group:${groupId}`);

  const groups = new ScaleGroupService(groupIds, senderDid, clock);
  const identityService = new ScaleIdentityService();
  const service = new MessageService(groups as unknown as never, {
    clock,
    identityService,
  });

  const sendLatenciesMs: number[] = [];
  const sendStartedAt = process.hrtime.bigint();

  for (let i = 0; i < messagesPerConversation; i++) {
    for (const conversationId of conversations) {
      const envelopeId = randomUUID();
      const started = process.hrtime.bigint();
      await service.send({
        envelopeId,
        senderDid,
        conversationId,
        conversationType: 'group',
        targetDomain: 'scale.tel',
        mailboxKeyId: 'mls-scale-key',
        sealedHeader: '0x01',
        ciphertext: `0x${Buffer.from(`msg:${i}:${conversationId}`).toString('hex')}`,
        contentType: 'text',
        ttlSec: 3600,
      });
      const ended = process.hrtime.bigint();
      sendLatenciesMs.push(Number(ended - started) / 1_000_000);
      clock.tick(1);
    }
  }

  const sendEndedAt = process.hrtime.bigint();
  const totalSendDurationMs = Number(sendEndedAt - sendStartedAt) / 1_000_000;
  const throughputMps = totalMessages / Math.max(0.001, totalSendDurationMs / 1000);
  const p95SendLatencyMs = percentile(sendLatenciesMs, 0.95);

  const dedupeEnvelopeId = randomUUID();
  const dedupeInput = {
    envelopeId: dedupeEnvelopeId,
    senderDid,
    conversationId: conversations[0]!,
    conversationType: 'group' as const,
    targetDomain: 'scale.tel',
    mailboxKeyId: 'mls-scale-key',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text' as const,
    ttlSec: 3600,
  };
  const dedupeFirst = await service.send(dedupeInput);
  const dedupeSecond = await service.send(dedupeInput);
  const dedupeStablePass = dedupeFirst.seq === dedupeSecond.seq;

  let dedupeConflictPass = false;
  try {
    await service.send({
      ...dedupeInput,
      ciphertext: '0x33',
    });
  } catch (error) {
    dedupeConflictPass = error instanceof TelagentError && error.code === ErrorCodes.CONFLICT;
  }

  let seqMonotonicPass = true;
  for (const conversationId of conversations) {
    const pulled = await service.pull({ conversationId, limit: 200 });
    const seqs = pulled.items.map((item) => item.seq);
    for (let i = 1; i < seqs.length; i++) {
      if ((seqs[i - 1] ?? 0n) >= (seqs[i] ?? 0n)) {
        seqMonotonicPass = false;
        break;
      }
    }
    if (!seqMonotonicPass) {
      break;
    }
  }

  const throughputPass = throughputMps >= 500;
  const latencyPass = p95SendLatencyMs <= 20;

  const report: Phase13ScaleLoadReport = {
    phase: 'Phase 13',
    taskId: 'TA-P13-002',
    generatedAt: new Date().toISOString(),
    summary: {
      totalMessages,
      totalConversations,
      throughputMps,
      p95SendLatencyMs,
      seqMonotonicPass,
      dedupeStablePass,
      dedupeConflictPass,
      throughputPass,
      latencyPass,
    },
    decision: seqMonotonicPass && dedupeStablePass && dedupeConflictPass && throughputPass && latencyPass
      ? 'PASS'
      : 'FAIL',
    details: {
      messagesPerConversation,
      totalSendDurationMs,
      latency: {
        p50: percentile(sendLatenciesMs, 0.5),
        p90: percentile(sendLatenciesMs, 0.9),
        p95: p95SendLatencyMs,
        p99: percentile(sendLatenciesMs, 0.99),
        max: sendLatenciesMs.length === 0 ? 0 : Math.max(...sendLatenciesMs),
      },
      sampledConversations: conversations.slice(0, 5),
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-P13-002] totalMessages=${totalMessages}`);
  console.log(`[TA-P13-002] throughputMps=${throughputMps.toFixed(2)}`);
  console.log(`[TA-P13-002] p95SendLatencyMs=${p95SendLatencyMs.toFixed(3)}`);
  console.log(`[TA-P13-002] decision=${report.decision}`);
  console.log(`[TA-P13-002] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 13 scale load check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P13-002] execution failed');
  console.error(error);
  process.exitCode = 1;
});
