import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashDid, type AgentDID } from '@telagent/protocol';

import { MessageService } from '../src/services/message-service.js';
import { MessageRepository } from '../src/storage/message-repository.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface Phase13DrDrillReport {
  phase: 'Phase 13';
  taskId: 'TA-P13-003';
  generatedAt: string;
  summary: {
    originalCount: number;
    restoredCount: number;
    rtoMs: number;
    rpoMessagesLost: number;
    backupCreatedPass: boolean;
    restoreIntegrityPass: boolean;
    sequenceContinuesPass: boolean;
    rtoWithinSloPass: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function createClock(startMs = 1_772_590_600_000): MutableClock {
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

function hex32(seed: string): string {
  return `0x${createHash('sha256').update(seed).digest('hex')}`;
}

class DrillGroupService {
  private readonly didHash: string;

  constructor(
    private readonly groupId: string,
    private readonly senderDid: AgentDID,
    private readonly clock: MutableClock,
  ) {
    this.didHash = hashDid(senderDid);
  }

  getChainState(groupId: string) {
    return {
      groupId,
      state: 'ACTIVE' as const,
      finalizedTxHash: `0x${'f'.repeat(64)}`,
      blockNumber: 88,
      updatedAtMs: this.clock.now(),
    };
  }

  listMembers(groupId: string) {
    return [
      {
        groupId,
        did: this.senderDid,
        didHash: this.didHash,
        state: 'FINALIZED' as const,
        joinedAtMs: this.clock.now(),
      },
    ];
  }

  listGroups() {
    return [{ groupId: this.groupId }];
  }
}

class DrillIdentityService {
  async assertActiveDid(rawDid: string) {
    return {
      did: rawDid,
      didHash: hashDid(rawDid as AgentDID),
      isActive: true,
    };
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(source: string, target: string): Promise<boolean> {
  if (!(await exists(source))) {
    return false;
  }
  await fs.copyFile(source, target);
  return true;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P13_DR_DRILL_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-13/manifests/2026-03-03-p13-dr-drill-check.json');

  const tempRoot = path.resolve(repoRoot, '.tmp', `phase13-dr-${Date.now()}`);
  const sourceDir = path.join(tempRoot, 'source');
  const backupDir = path.join(tempRoot, 'backup');
  const restoreDir = path.join(tempRoot, 'restore');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(backupDir, { recursive: true });
  await fs.mkdir(restoreDir, { recursive: true });

  const sourceDbPath = path.join(sourceDir, 'mailbox.sqlite');
  const backupDbPath = path.join(backupDir, 'mailbox.sqlite');
  const restoredDbPath = path.join(restoreDir, 'mailbox.sqlite');

  const clock = createClock();
  const senderDid = 'did:claw:zDrSender' as AgentDID;
  const groupId = hex32('phase13-dr-group');
  const conversationId = `group:${groupId}`;

  const groups = new DrillGroupService(groupId, senderDid, clock);
  const identityService = new DrillIdentityService();

  const sourceRepo = new MessageRepository(sourceDbPath);
  const sourceService = new MessageService(groups as unknown as never, {
    repository: sourceRepo,
    identityService,
    clock,
  });

  const originalCountTarget = 120;
  for (let i = 0; i < originalCountTarget; i++) {
    await sourceService.send({
      envelopeId: randomUUID(),
      senderDid,
      conversationId,
      conversationType: 'group',
      targetDomain: 'dr.tel',
      mailboxKeyId: 'mls-dr-key',
      sealedHeader: '0x01',
      ciphertext: `0x${Buffer.from(`dr:${i}`).toString('hex')}`,
      contentType: 'text',
      ttlSec: 3600,
    });
    clock.tick(1);
  }

  const originalCount = await sourceRepo.countEnvelopes(conversationId);

  const copiedFiles = {
    sqlite: await copyIfExists(sourceDbPath, backupDbPath),
    wal: await copyIfExists(`${sourceDbPath}-wal`, `${backupDbPath}-wal`),
    shm: await copyIfExists(`${sourceDbPath}-shm`, `${backupDbPath}-shm`),
  };

  await fs.copyFile(backupDbPath, restoredDbPath);
  await copyIfExists(`${backupDbPath}-wal`, `${restoredDbPath}-wal`);
  await copyIfExists(`${backupDbPath}-shm`, `${restoredDbPath}-shm`);

  const restoreStartedAt = Date.now();
  const restoredRepo = new MessageRepository(restoredDbPath);
  const restoredCount = await restoredRepo.countEnvelopes(conversationId);
  const restoredService = new MessageService(groups as unknown as never, {
    repository: restoredRepo,
    identityService,
    clock,
  });

  const restoredSend = await restoredService.send({
    envelopeId: randomUUID(),
    senderDid,
    conversationId,
    conversationType: 'group',
    targetDomain: 'dr.tel',
    mailboxKeyId: 'mls-dr-key',
    sealedHeader: '0x10',
    ciphertext: '0x42',
    contentType: 'text',
    ttlSec: 3600,
  });
  const rtoMs = Date.now() - restoreStartedAt;

  const rpoMessagesLost = Math.max(0, originalCount - restoredCount);
  const backupCreatedPass = copiedFiles.sqlite;
  const restoreIntegrityPass = restoredCount === originalCount;
  const sequenceContinuesPass = restoredSend.seq === BigInt(originalCount + 1);
  const rtoWithinSloPass = rtoMs <= 2_000;

  const report: Phase13DrDrillReport = {
    phase: 'Phase 13',
    taskId: 'TA-P13-003',
    generatedAt: new Date().toISOString(),
    summary: {
      originalCount,
      restoredCount,
      rtoMs,
      rpoMessagesLost,
      backupCreatedPass,
      restoreIntegrityPass,
      sequenceContinuesPass,
      rtoWithinSloPass,
    },
    decision: backupCreatedPass && restoreIntegrityPass && sequenceContinuesPass && rtoWithinSloPass
      ? 'PASS'
      : 'FAIL',
    details: {
      tempRoot,
      sourceDbPath,
      backupDbPath,
      restoredDbPath,
      copiedFiles,
      restoredSendSeq: restoredSend.seq.toString(),
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.rm(tempRoot, { recursive: true, force: true });

  console.log(`[TA-P13-003] originalCount=${originalCount}`);
  console.log(`[TA-P13-003] restoredCount=${restoredCount}`);
  console.log(`[TA-P13-003] rtoMs=${rtoMs}`);
  console.log(`[TA-P13-003] rpoMessagesLost=${rpoMessagesLost}`);
  console.log(`[TA-P13-003] decision=${report.decision}`);
  console.log(`[TA-P13-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 13 DR drill check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P13-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});
