import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashDid, type GroupState } from '@telagent/protocol';

import { MessageService, type MessageServiceClock } from '../src/services/message-service.js';
import { MessageRepository } from '../src/storage/message-repository.js';

interface MutableClock extends MessageServiceClock {
  tick(ms: number): void;
}

interface P6Report {
  phase: 'Phase 6';
  taskId: 'TA-P6-001';
  generatedAt: string;
  summary: {
    persistedAcrossRestart: boolean;
    sequenceContinues: boolean;
    provisionalRetractedOnReorg: boolean;
    ttlCleanupWorksOnPersistentStore: boolean;
  };
  details: Record<string, unknown>;
  decision: 'PASS' | 'FAIL';
}

function createClock(startMs = 1_000_000): MutableClock {
  let current = startMs;
  return {
    now() {
      return current;
    },
    tick(ms: number) {
      current += ms;
    },
  };
}

function createGroupHarness() {
  const stateByGroup = new Map<string, GroupState>();
  const membersByGroup = new Map<string, Array<{ didHash: string; state: 'PENDING' | 'FINALIZED' | 'REMOVED' }>>();

  return {
    groups: {
      getChainState(groupId: string) {
        const state = stateByGroup.get(groupId);
        if (!state) {
          throw new Error(`group(${groupId}) not found`);
        }
        return {
          groupId,
          state,
          updatedAtMs: Date.now(),
        };
      },
      listMembers(groupId: string) {
        return (membersByGroup.get(groupId) ?? []).map((member) => ({
          groupId,
          did: `did:claw:${member.didHash.slice(2, 10)}`,
          didHash: member.didHash,
          state: member.state,
          joinedAtMs: Date.now(),
        }));
      },
    } as unknown as ConstructorParameters<typeof MessageService>[0],
    setGroupState(groupId: string, state: GroupState) {
      stateByGroup.set(groupId, state);
    },
    setMemberState(groupId: string, did: string, state: 'PENDING' | 'FINALIZED' | 'REMOVED') {
      const members = membersByGroup.get(groupId) ?? [];
      const didHash = hashDid(did);
      const nextMembers = members.filter((item) => item.didHash !== didHash);
      nextMembers.push({
        didHash,
        state,
      });
      membersByGroup.set(groupId, nextMembers);
    },
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath =
    process.env.P6_MAILBOX_REPORT_OUTPUT ??
    path.resolve(
      repoRoot,
      'docs/implementation/phase-6/manifests/2026-03-03-p6-mailbox-persistence-check.json',
    );

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telagent-p6-mailbox-check-'));
  const dbPath = path.join(tmpDir, 'mailbox.sqlite');
  const clock = createClock();
  const harness = createGroupHarness();
  const groupId = `0x${'c'.repeat(64)}`;
  harness.setGroupState(groupId, 'PENDING_ONCHAIN');
  harness.setMemberState(groupId, 'did:claw:zAlice', 'FINALIZED');

  const firstRepo = new MessageRepository(dbPath);
  const firstService = new MessageService(harness.groups, {
    clock,
    repository: firstRepo,
  });

  const firstDirect = firstService.send({
    envelopeId: 'env-p6-direct-1',
    senderDid: 'did:claw:zAlice',
    conversationId: 'direct:alice-bob',
    conversationType: 'direct',
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-direct',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text',
    ttlSec: 5,
  });

  const firstGroup = firstService.send({
    envelopeId: 'env-p6-group-1',
    senderDid: 'did:claw:zAlice',
    conversationId: `group:${groupId}`,
    conversationType: 'group',
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-group',
    sealedHeader: '0x33',
    ciphertext: '0x44',
    contentType: 'text',
    ttlSec: 30,
  });

  const secondRepo = new MessageRepository(dbPath);
  const secondService = new MessageService(harness.groups, {
    clock,
    repository: secondRepo,
  });

  const directAfterRestart = secondService.pull({
    conversationId: 'direct:alice-bob',
    limit: 10,
  });
  const groupAfterRestart = secondService.pull({
    conversationId: `group:${groupId}`,
    limit: 10,
  });

  const secondDirect = secondService.send({
    envelopeId: 'env-p6-direct-2',
    senderDid: 'did:claw:zAlice',
    conversationId: 'direct:alice-bob',
    conversationType: 'direct',
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-direct',
    sealedHeader: '0x55',
    ciphertext: '0x66',
    contentType: 'text',
    ttlSec: 30,
  });

  harness.setGroupState(groupId, 'REORGED_BACK');
  const maintenance = secondService.runMaintenance(clock.now());
  const retractions = secondService.listRetracted(10);
  const groupAfterReorg = secondService.pull({
    conversationId: `group:${groupId}`,
    limit: 10,
  });

  clock.tick(6_000);
  const cleanup = secondService.cleanupExpired(clock.now());
  const directAfterCleanup = secondService.pull({
    conversationId: 'direct:alice-bob',
    limit: 10,
  });

  const persistedAcrossRestart = directAfterRestart.items.some((item) => item.envelopeId === firstDirect.envelopeId)
    && groupAfterRestart.items.some((item) => item.envelopeId === firstGroup.envelopeId);
  const sequenceContinues = secondDirect.seq === 2n;
  const provisionalRetractedOnReorg = maintenance.retraction.retracted === 1
    && retractions.some((item) => item.envelopeId === firstGroup.envelopeId)
    && groupAfterReorg.items.length === 0;
  const ttlCleanupWorksOnPersistentStore = cleanup.removed >= 1
    && directAfterCleanup.items.every((item) => item.envelopeId !== firstDirect.envelopeId);

  const report: P6Report = {
    phase: 'Phase 6',
    taskId: 'TA-P6-001',
    generatedAt: new Date().toISOString(),
    summary: {
      persistedAcrossRestart,
      sequenceContinues,
      provisionalRetractedOnReorg,
      ttlCleanupWorksOnPersistentStore,
    },
    details: {
      firstDirectSeq: firstDirect.seq.toString(),
      secondDirectSeq: secondDirect.seq.toString(),
      directAfterRestartCount: directAfterRestart.items.length,
      groupAfterRestartCount: groupAfterRestart.items.length,
      maintenance,
      cleanup,
      retractions,
      directAfterCleanupCount: directAfterCleanup.items.length,
    },
    decision: persistedAcrossRestart && sequenceContinues && provisionalRetractedOnReorg && ttlCleanupWorksOnPersistentStore
      ? 'PASS'
      : 'FAIL',
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(
    `[TA-P6-001] persistedAcrossRestart=${persistedAcrossRestart} sequenceContinues=${sequenceContinues} provisionalRetractedOnReorg=${provisionalRetractedOnReorg} ttlCleanupWorksOnPersistentStore=${ttlCleanupWorksOnPersistentStore}`,
  );
  console.log(`[TA-P6-001] decision=${report.decision}`);
  console.log(`[TA-P6-001] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 6 mailbox persistence check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P6-001] execution failed');
  console.error(error);
  process.exitCode = 1;
});
