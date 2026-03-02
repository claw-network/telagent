import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GroupRepository, type GroupEventRecord } from '../src/storage/group-repository.js';

function didFromHash(hash: string): string {
  if (!hash || !hash.startsWith('0x')) {
    return 'did:claw:unknown';
  }
  return `did:claw:${hash.slice(2, 18)}`;
}

function read(payload: Record<string, unknown>, key: string): string {
  return String(payload[key] ?? '');
}

function replayEvent(repo: GroupRepository, event: GroupEventRecord): void {
  const txHash = event.txHash ?? undefined;
  const blockNumber = event.blockNumber ?? undefined;

  if (event.eventName === 'GroupCreated') {
    const groupId = read(event.payload, 'groupId');
    const creatorDidHash = read(event.payload, 'creatorDidHash');
    const domainProofHash = read(event.payload, 'domainProofHash');

    repo.saveGroup({
      groupId,
      creatorDid: didFromHash(creatorDidHash),
      creatorDidHash,
      groupDomain: '',
      domainProofHash,
      initialMlsStateHash: '0x' + '0'.repeat(64),
      state: 'ACTIVE',
      createdAtMs: event.createdAtMs,
      txHash,
      blockNumber,
    });

    repo.saveMember({
      groupId,
      did: didFromHash(creatorDidHash),
      didHash: creatorDidHash,
      state: 'FINALIZED',
      joinedAtMs: event.createdAtMs,
      txHash,
    });

    repo.saveChainState({
      groupId,
      state: 'ACTIVE',
      finalizedTxHash: txHash,
      blockNumber,
      updatedAtMs: event.createdAtMs,
    });
    return;
  }

  if (event.eventName === 'MemberInvited') {
    const groupId = read(event.payload, 'groupId');
    const inviteId = read(event.payload, 'inviteId');
    const inviteeDidHash = read(event.payload, 'inviteeDidHash');

    repo.saveMember({
      groupId,
      did: didFromHash(inviteeDidHash),
      didHash: inviteeDidHash,
      state: 'PENDING',
      joinedAtMs: event.createdAtMs,
      inviteId,
      txHash,
    });
    return;
  }

  if (event.eventName === 'MemberAccepted') {
    const groupId = read(event.payload, 'groupId');
    const inviteId = read(event.payload, 'inviteId');
    const memberDidHash = read(event.payload, 'memberDidHash');

    repo.saveMember({
      groupId,
      did: didFromHash(memberDidHash),
      didHash: memberDidHash,
      state: 'FINALIZED',
      joinedAtMs: event.createdAtMs,
      inviteId,
      txHash,
    });
    return;
  }

  if (event.eventName === 'MemberRemoved') {
    const groupId = read(event.payload, 'groupId');
    const memberDidHash = read(event.payload, 'memberDidHash');

    repo.saveMember({
      groupId,
      did: didFromHash(memberDidHash),
      didHash: memberDidHash,
      state: 'REMOVED',
      joinedAtMs: event.createdAtMs,
      txHash,
    });
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const dbPath =
    process.env.P3_READ_MODEL_DB_PATH ??
    path.resolve(repoRoot, '.data/telagent-node/group-indexer.sqlite');
  const toBlock = process.env.P3_REBUILD_TO_BLOCK
    ? Number(process.env.P3_REBUILD_TO_BLOCK)
    : undefined;

  const repo = new GroupRepository(dbPath);
  const events = repo.listAllEvents(toBlock);

  repo.clearReadModel();
  for (const event of events) {
    replayEvent(repo, event);
  }

  const summary = {
    phase: 'Phase 3',
    taskId: 'TA-P3-005',
    dbPath,
    replayedEvents: events.length,
    toBlock: toBlock ?? null,
    rebuiltGroups: repo.listGroups().length,
    executedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
