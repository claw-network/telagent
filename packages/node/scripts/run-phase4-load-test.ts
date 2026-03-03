import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { hashDid, type AgentDID, type GroupState } from '@telagent/protocol';

import { MessageService, type SendMessageInput } from '../src/services/message-service.js';

interface GroupMemberState {
  didHash: string;
  state: 'PENDING' | 'FINALIZED' | 'REMOVED';
}

class PerfGroupService {
  private readonly members = new Map<string, GroupMemberState[]>();
  private readonly chainState = new Map<string, GroupState>();

  seedGroup(groupId: string, memberDids: AgentDID[], state: GroupState): void {
    this.members.set(
      groupId,
      memberDids.map((did) => ({
        didHash: hashDid(did),
        state: 'FINALIZED',
      })),
    );
    this.chainState.set(groupId, state);
  }

  getChainState(groupId: string): { groupId: string; state: GroupState; updatedAtMs: number } {
    const state = this.chainState.get(groupId);
    if (!state) {
      throw new Error(`group(${groupId}) not found`);
    }
    return {
      groupId,
      state,
      updatedAtMs: Date.now(),
    };
  }

  listMembers(groupId: string): Array<{
    groupId: string;
    did: string;
    didHash: string;
    state: 'PENDING' | 'FINALIZED' | 'REMOVED';
    joinedAtMs: number;
  }> {
    const members = this.members.get(groupId);
    if (!members) {
      throw new Error(`group(${groupId}) not found`);
    }
    return members.map((item, index) => ({
      groupId,
      did: `did:claw:zMember${index.toString().padStart(4, '0')}`,
      didHash: item.didHash,
      state: item.state,
      joinedAtMs: Date.now(),
    }));
  }
}

interface LoadScenarioConfig {
  groupId: string;
  groupDomain: string;
  memberCount: number;
  messagesPerMember: number;
  dedupeReplayCount: number;
  pullPageSize: number;
}

interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

interface LoadMetrics {
  send: {
    totalMessages: number;
    durationMs: number;
    throughputPerSec: number;
    latencyMs: Percentiles;
    errors: number;
  };
  dedupe: {
    replayCount: number;
    hitCount: number;
    hitRate: number;
    latencyMs: Percentiles;
  };
  pull: {
    pages: number;
    totalItems: number;
    durationMs: number;
    latencyMs: Percentiles;
  };
  checks: {
    expectedMembers: number;
    orderingViolationCount: number;
    duplicateEnvelopeCount: number;
    provisionalCount: number;
  };
}

interface SloThresholds {
  maxMembers: number;
  minThroughputPerSec: number;
  maxSendP95Ms: number;
  maxPullP95Ms: number;
  minDedupeHitRate: number;
  maxOrderingViolationCount: number;
  maxDuplicateEnvelopeCount: number;
}

interface SloEvaluation {
  passed: boolean;
  checks: Record<string, boolean>;
}

interface LoadReport {
  phase: 'Phase 4';
  taskId: 'TA-P4-011';
  generatedAt: string;
  config: LoadScenarioConfig;
  metrics: LoadMetrics;
  thresholds: SloThresholds;
  evaluation: SloEvaluation;
}

function readIntEnv(name: string, fallback: number): number {
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

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function toPercentiles(values: number[]): Percentiles {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length > 0 ? Math.max(...values) : 0,
  };
}

function bytes32FromFill(fill: string): string {
  return `0x${fill.repeat(64)}`;
}

function buildMemberDid(index: number): AgentDID {
  return `did:claw:zPerf${index.toString().padStart(4, '0')}`;
}

function buildEnvelopeInput(
  index: number,
  senderDid: AgentDID,
  conversationId: string,
  groupDomain: string,
): SendMessageInput {
  const selectors: Array<'text' | 'image' | 'file'> = ['text', 'image', 'file'];
  const contentType = selectors[index % selectors.length];
  const manifestSuffix = ['a', 'b', 'c'][index % 3];

  return {
    envelopeId: `p4-load-env-${index.toString().padStart(6, '0')}`,
    senderDid,
    conversationId,
    conversationType: 'group',
    targetDomain: groupDomain,
    mailboxKeyId: 'mailbox-load',
    sealedHeader: `0x${(index + 1).toString(16)}`,
    ciphertext: `0x${(index + 1000).toString(16)}`,
    contentType,
    attachmentManifestHash: contentType === 'text' ? undefined : bytes32FromFill(manifestSuffix),
    ttlSec: 172_800,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const memberCount = readIntEnv('P4_LOAD_MEMBER_COUNT', 500);
  const messagesPerMember = readIntEnv('P4_LOAD_MESSAGES_PER_MEMBER', 4);
  const dedupeReplayCount = readIntEnv('P4_LOAD_DEDUPE_REPLAY_COUNT', 200);
  const pullPageSize = readIntEnv('P4_LOAD_PULL_PAGE_SIZE', 200);

  const outputPath =
    process.env.P4_LOAD_OUTPUT_PATH ??
    path.resolve(repoRoot, 'docs/implementation/phase-4/manifests/2026-03-03-p4-load-test.json');

  const config: LoadScenarioConfig = {
    groupId: bytes32FromFill('f'),
    groupDomain: 'load.tel',
    memberCount,
    messagesPerMember,
    dedupeReplayCount,
    pullPageSize,
  };

  const members = Array.from({ length: config.memberCount }, (_, index) => buildMemberDid(index + 1));
  const totalMessages = config.memberCount * config.messagesPerMember;
  const conversationId = `group:${config.groupId}`;

  const groups = new PerfGroupService();
  groups.seedGroup(config.groupId, members, 'ACTIVE');

  const service = new MessageService(groups as unknown as ConstructorParameters<typeof MessageService>[0]);

  const sendLatencies: number[] = [];
  const dedupeLatencies: number[] = [];
  const pullLatencies: number[] = [];

  const payloadByEnvelopeId = new Map<string, SendMessageInput>();
  const seqByEnvelopeId = new Map<string, bigint>();

  let sendErrors = 0;
  let dedupeHits = 0;

  const sendStart = performance.now();
  for (let index = 0; index < totalMessages; index++) {
    const senderDid = members[index % members.length];
    const payload = buildEnvelopeInput(index + 1, senderDid, conversationId, config.groupDomain);

    const t0 = performance.now();
    try {
      const envelope = await service.send(payload);
      payloadByEnvelopeId.set(envelope.envelopeId, payload);
      seqByEnvelopeId.set(envelope.envelopeId, envelope.seq);
    } catch {
      sendErrors++;
    } finally {
      sendLatencies.push(performance.now() - t0);
    }
  }
  const sendDurationMs = performance.now() - sendStart;

  const dedupeCandidates = Array.from(payloadByEnvelopeId.keys()).slice(0, Math.min(config.dedupeReplayCount, totalMessages));
  for (const envelopeId of dedupeCandidates) {
    const payload = payloadByEnvelopeId.get(envelopeId);
    if (!payload) {
      continue;
    }

    const expectedSeq = seqByEnvelopeId.get(envelopeId);
    const t0 = performance.now();
    try {
      const replayed = await service.send(payload);
      if (expectedSeq != null && replayed.seq === expectedSeq) {
        dedupeHits++;
      }
    } finally {
      dedupeLatencies.push(performance.now() - t0);
    }
  }

  const pulledItems: Array<{ envelopeId: string; seq: bigint; provisional?: boolean }> = [];
  let cursor: string | undefined;
  const pullStart = performance.now();
  do {
    const t0 = performance.now();
    const result = await service.pull({
      conversationId,
      limit: config.pullPageSize,
      cursor,
    });
    pullLatencies.push(performance.now() - t0);
    pulledItems.push(...result.items.map((item) => ({ envelopeId: item.envelopeId, seq: item.seq, provisional: item.provisional })));
    cursor = result.nextCursor ?? undefined;
  } while (cursor);
  const pullDurationMs = performance.now() - pullStart;

  let orderingViolationCount = 0;
  for (let i = 1; i < pulledItems.length; i++) {
    if (pulledItems[i].seq <= pulledItems[i - 1].seq) {
      orderingViolationCount++;
    }
  }

  const uniqueEnvelopeCount = new Set(pulledItems.map((item) => item.envelopeId)).size;
  const duplicateEnvelopeCount = pulledItems.length - uniqueEnvelopeCount;
  const provisionalCount = pulledItems.filter((item) => item.provisional === true).length;

  const metrics: LoadMetrics = {
    send: {
      totalMessages,
      durationMs: sendDurationMs,
      throughputPerSec: sendDurationMs > 0 ? (totalMessages / sendDurationMs) * 1000 : totalMessages,
      latencyMs: toPercentiles(sendLatencies),
      errors: sendErrors,
    },
    dedupe: {
      replayCount: dedupeCandidates.length,
      hitCount: dedupeHits,
      hitRate: dedupeCandidates.length > 0 ? dedupeHits / dedupeCandidates.length : 1,
      latencyMs: toPercentiles(dedupeLatencies),
    },
    pull: {
      pages: pullLatencies.length,
      totalItems: pulledItems.length,
      durationMs: pullDurationMs,
      latencyMs: toPercentiles(pullLatencies),
    },
    checks: {
      expectedMembers: config.memberCount,
      orderingViolationCount,
      duplicateEnvelopeCount,
      provisionalCount,
    },
  };

  const thresholds: SloThresholds = {
    maxMembers: 500,
    minThroughputPerSec: 200,
    maxSendP95Ms: 20,
    maxPullP95Ms: 100,
    minDedupeHitRate: 1,
    maxOrderingViolationCount: 0,
    maxDuplicateEnvelopeCount: 0,
  };

  const evaluationChecks: Record<string, boolean> = {
    memberCountWithinTarget: config.memberCount <= thresholds.maxMembers,
    sendErrorFree: metrics.send.errors === 0,
    throughputSufficient: metrics.send.throughputPerSec >= thresholds.minThroughputPerSec,
    sendP95WithinSlo: metrics.send.latencyMs.p95 <= thresholds.maxSendP95Ms,
    pullP95WithinSlo: metrics.pull.latencyMs.p95 <= thresholds.maxPullP95Ms,
    dedupeHitRateSufficient: metrics.dedupe.hitRate >= thresholds.minDedupeHitRate,
    orderingStable: metrics.checks.orderingViolationCount <= thresholds.maxOrderingViolationCount,
    duplicateFree: metrics.checks.duplicateEnvelopeCount <= thresholds.maxDuplicateEnvelopeCount,
  };

  const report: LoadReport = {
    phase: 'Phase 4',
    taskId: 'TA-P4-011',
    generatedAt: new Date().toISOString(),
    config,
    metrics,
    thresholds,
    evaluation: {
      passed: Object.values(evaluationChecks).every(Boolean),
      checks: evaluationChecks,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));

  if (!report.evaluation.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
