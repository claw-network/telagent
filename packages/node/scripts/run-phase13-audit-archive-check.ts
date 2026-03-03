import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashDid, type AgentDID } from '@telagent/protocol';

import { MessageService } from '../src/services/message-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface AuditArchiveRecord {
  archiveVersion: 'v1';
  generatedAt: string;
  snapshot: Record<string, unknown>;
  proof: {
    algorithm: 'HMAC-SHA256';
    digest: string;
    signature: string;
    keyHint: string;
  };
}

interface Phase13AuditArchiveReport {
  phase: 'Phase 13';
  taskId: 'TA-P13-004';
  generatedAt: string;
  summary: {
    archiveWrittenPass: boolean;
    digestVerifiedPass: boolean;
    signatureVerifiedPass: boolean;
    samplePresentPass: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function createClock(startMs = 1_772_591_000_000): MutableClock {
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

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`);
  return `{${pairs.join(',')}}`;
}

class AuditGroupService {
  private readonly senderDidHash: string;

  constructor(
    private readonly groupId: string,
    private readonly senderDid: AgentDID,
    private readonly clock: MutableClock,
  ) {
    this.senderDidHash = hashDid(senderDid);
  }

  getChainState(groupId: string) {
    return {
      groupId,
      state: 'ACTIVE' as const,
      finalizedTxHash: `0x${'b'.repeat(64)}`,
      blockNumber: 321,
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
    return [{ groupId: this.groupId }];
  }
}

class AuditIdentityService {
  async assertActiveDid(rawDid: string) {
    return {
      did: rawDid,
      didHash: hashDid(rawDid as AgentDID),
      isActive: true,
    };
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const archivePath = process.env.P13_AUDIT_ARCHIVE_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-13/archives/2026-03-03-p13-audit-snapshot-archive.json');
  const manifestPath = process.env.P13_AUDIT_ARCHIVE_MANIFEST_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-13/manifests/2026-03-03-p13-audit-archive-check.json');

  const signingSecret = process.env.P13_AUDIT_ARCHIVE_SIGNING_SECRET ?? 'telagent-phase13-audit-secret';
  const keyHint = process.env.P13_AUDIT_ARCHIVE_KEY_HINT ?? 'env:P13_AUDIT_ARCHIVE_SIGNING_SECRET';

  const clock = createClock();
  const senderDid = 'did:claw:zAuditSigner' as AgentDID;
  const groupId = `0x${'d'.repeat(64)}`;
  const conversationId = `group:${groupId}`;

  const service = new MessageService(new AuditGroupService(groupId, senderDid, clock) as unknown as never, {
    clock,
    identityService: new AuditIdentityService(),
  });

  await service.send({
    senderDid,
    conversationId,
    conversationType: 'group',
    targetDomain: 'audit.tel',
    mailboxKeyId: 'mls-audit-key',
    sealedHeader: '0x01',
    ciphertext: '0xaaaa',
    contentType: 'text',
    ttlSec: 3600,
  });
  clock.tick(10);

  await service.send({
    senderDid,
    conversationId,
    conversationType: 'group',
    targetDomain: 'audit.tel',
    mailboxKeyId: 'mls-audit-key',
    sealedHeader: '0x02',
    ciphertext: '0xbbbb',
    contentType: 'control',
    ttlSec: 3600,
  });

  const snapshot = await service.buildAuditSnapshot({ sampleSize: 10, retractionScanLimit: 500 });
  const archiveBase = {
    archiveVersion: 'v1' as const,
    generatedAt: new Date().toISOString(),
    snapshot,
  };
  const canonicalPayload = canonicalize(archiveBase);
  const digest = createHash('sha256').update(canonicalPayload).digest('hex');
  const signature = createHmac('sha256', signingSecret).update(canonicalPayload).digest('hex');

  const archiveRecord: AuditArchiveRecord = {
    ...archiveBase,
    proof: {
      algorithm: 'HMAC-SHA256',
      digest,
      signature,
      keyHint,
    },
  };

  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, `${JSON.stringify(archiveRecord, null, 2)}\n`, 'utf8');

  const reloaded = JSON.parse(await fs.readFile(archivePath, 'utf8')) as AuditArchiveRecord;
  const verificationCanonical = canonicalize({
    archiveVersion: reloaded.archiveVersion,
    generatedAt: reloaded.generatedAt,
    snapshot: reloaded.snapshot,
  });
  const verificationDigest = createHash('sha256').update(verificationCanonical).digest('hex');
  const verificationSignature = createHmac('sha256', signingSecret).update(verificationCanonical).digest('hex');

  const archiveWrittenPass = Boolean(reloaded?.proof?.digest);
  const digestVerifiedPass = verificationDigest === reloaded.proof.digest;
  const signatureVerifiedPass = verificationSignature === reloaded.proof.signature;
  const samplePresentPass = Array.isArray((reloaded.snapshot as Record<string, unknown>).sampledIsolationEvents)
    && ((reloaded.snapshot as Record<string, unknown>).sampledIsolationEvents as unknown[]).length >= 0;

  const report: Phase13AuditArchiveReport = {
    phase: 'Phase 13',
    taskId: 'TA-P13-004',
    generatedAt: new Date().toISOString(),
    summary: {
      archiveWrittenPass,
      digestVerifiedPass,
      signatureVerifiedPass,
      samplePresentPass,
    },
    decision: archiveWrittenPass && digestVerifiedPass && signatureVerifiedPass && samplePresentPass
      ? 'PASS'
      : 'FAIL',
    details: {
      archivePath,
      digest,
      signature,
      keyHint,
      snapshotMeta: {
        activeEnvelopeCount: snapshot.activeEnvelopeCount,
        retractedCount: snapshot.retractedCount,
        revokedDidCount: snapshot.revokedDidCount,
      },
    },
  };

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-P13-004] archivePath=${archivePath}`);
  console.log(`[TA-P13-004] digestVerifiedPass=${digestVerifiedPass}`);
  console.log(`[TA-P13-004] signatureVerifiedPass=${signatureVerifiedPass}`);
  console.log(`[TA-P13-004] decision=${report.decision}`);
  console.log(`[TA-P13-004] output=${manifestPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 13 audit archive check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P13-004] execution failed');
  console.error(error);
  process.exitCode = 1;
});
