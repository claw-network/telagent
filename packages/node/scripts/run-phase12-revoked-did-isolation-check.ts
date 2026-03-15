import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError, hashDid } from '@telagent/protocol';

import {
  MessageService,
  type MessageDidRevocationEvent,
  type MessageIdentityService,
} from '../src/services/message-service.js';

interface MutableClock {
  now(): number;
}

interface Phase12RevokedDidIsolationReport {
  phase: 'Phase 12';
  taskId: 'TA-P12-003';
  generatedAt: string;
  summary: {
    revocationEventAccepted: boolean;
    relatedSessionsIsolated: boolean;
    postRevokeSendBlocked: boolean;
    blockedErrorCode: string | null;
    auditTrailRecorded: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, currentValue) => (typeof currentValue === 'bigint' ? currentValue.toString() : currentValue),
    2,
  );
}

function createClock(startMs = 1_772_582_400_000): MutableClock {
  return {
    now() {
      return startMs;
    },
  };
}

class MutableIdentityService implements MessageIdentityService {
  private readonly revoked = new Set<string>();
  private readonly subscribers = new Set<(event: MessageDidRevocationEvent) => void>();

  subscribeDidRevocations(listener: (event: MessageDidRevocationEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  notifyDidRevoked(did: string, source = 'phase12-script'): MessageDidRevocationEvent {
    this.revoked.add(did);
    const event: MessageDidRevocationEvent = {
      did,
      didHash: hashDid(did),
      revokedAtMs: Date.now(),
      source,
    };
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
    return event;
  }

  async assertActiveDid(rawDid: string): Promise<void> {
    if (this.revoked.has(rawDid)) {
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'DID is revoked or inactive');
    }
  }
}

function createGroupHarness(groupId: string, revokedDid: string) {
  const didHash = hashDid(revokedDid);
  return {
    getChainState(targetGroupId: string) {
      return {
        groupId: targetGroupId,
        state: 'ACTIVE' as const,
        updatedAtMs: Date.now(),
      };
    },
    listMembers(targetGroupId: string) {
      return [
        {
          groupId: targetGroupId,
          did: revokedDid,
          didHash,
          state: 'FINALIZED' as const,
          joinedAtMs: Date.now(),
        },
      ];
    },
    listGroups() {
      return [
        {
          groupId,
          creatorDid: revokedDid,
          creatorDidHash: didHash,
          groupDomain: 'alpha.tel',
          domainProofHash: `0x${'1'.repeat(64)}`,
          initialMlsStateHash: `0x${'2'.repeat(64)}`,
          state: 'ACTIVE' as const,
          createdAtMs: Date.now(),
        },
      ];
    },
  } as ConstructorParameters<typeof MessageService>[0];
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P12_REVOKED_DID_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-12/manifests/2026-03-03-p12-revoked-did-isolation-check.json');

  const revokedDid = 'did:claw:zRevokedP12';
  const directConversationId = 'direct:revoked-p12';
  const groupId = `0x${'a'.repeat(64)}`;
  const groupConversationId = `group:${groupId}`;

  const identityService = new MutableIdentityService();
  const messageService = new MessageService(createGroupHarness(groupId, revokedDid), {
    clock: createClock(),
    identityService,
  });

  await messageService.send({
    envelopeId: 'p12-revoke-send-1',
    senderDid: revokedDid,
    conversationId: directConversationId,
    conversationType: 'direct',
    targetDomain: 'node-a.tel',
    mailboxKeyId: 'signal-key-v1',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text',
    ttlSec: 60,
  });
  await messageService.send({
    envelopeId: 'p12-revoke-send-2',
    senderDid: revokedDid,
    conversationId: groupConversationId,
    conversationType: 'group',
    targetDomain: 'node-a.tel',
    mailboxKeyId: 'mls-key-v1',
    sealedHeader: '0x11',
    ciphertext: '0x23',
    contentType: 'text',
    ttlSec: 60,
  });

  const revocationEvent = identityService.notifyDidRevoked(revokedDid, 'phase12-revocation-feed');
  const revocationEventAccepted = revocationEvent.didHash === hashDid(revokedDid);

  const isolatedConversations = messageService.listIsolatedConversations(10);
  const isolatedConversationIds = isolatedConversations.map((entry) => entry.conversationId).sort();
  const relatedSessionsIsolated = isolatedConversationIds.length === 2
    && isolatedConversationIds[0] === directConversationId
    && isolatedConversationIds[1] === groupConversationId;

  let postRevokeSendBlocked = false;
  let blockedErrorCode: string | null = null;
  try {
    await messageService.send({
      envelopeId: 'p12-revoke-send-3',
      senderDid: revokedDid,
      conversationId: directConversationId,
      conversationType: 'direct',
      targetDomain: 'node-a.tel',
      mailboxKeyId: 'signal-key-v1',
      sealedHeader: '0x11',
      ciphertext: '0x24',
      contentType: 'text',
      ttlSec: 60,
    });
  } catch (error) {
    if (error instanceof TelagentError) {
      blockedErrorCode = error.code;
      postRevokeSendBlocked = error.code === ErrorCodes.UNPROCESSABLE;
    }
  }

  const isolationEvents = messageService.listIsolationEvents(10);
  const snapshot = await messageService.buildAuditSnapshot({
    sampleSize: 5,
    retractionScanLimit: 20,
  });
  const auditTrailRecorded = isolationEvents.length >= 1
    && isolationEvents[0].didHash === hashDid(revokedDid)
    && isolationEvents[0].isolatedConversationCount >= 2
    && snapshot.isolationEventCount >= 1
    && snapshot.isolatedConversationCount >= 2;

  const report: Phase12RevokedDidIsolationReport = {
    phase: 'Phase 12',
    taskId: 'TA-P12-003',
    generatedAt: new Date().toISOString(),
    summary: {
      revocationEventAccepted,
      relatedSessionsIsolated,
      postRevokeSendBlocked,
      blockedErrorCode,
      auditTrailRecorded,
    },
    decision:
      revocationEventAccepted
      && relatedSessionsIsolated
      && postRevokeSendBlocked
      && auditTrailRecorded
        ? 'PASS'
        : 'FAIL',
    details: {
      revokedDid,
      revocationEvent,
      isolatedConversations,
      isolationEvents,
      auditSnapshot: snapshot,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${toJson(report)}\n`, 'utf8');

  console.log(`[TA-P12-003] revocationEventAccepted=${revocationEventAccepted}`);
  console.log(`[TA-P12-003] relatedSessionsIsolated=${relatedSessionsIsolated} conversations=${isolatedConversationIds.join(',')}`);
  console.log(`[TA-P12-003] postRevokeSendBlocked=${postRevokeSendBlocked} blockedErrorCode=${blockedErrorCode ?? 'none'}`);
  console.log(`[TA-P12-003] auditTrailRecorded=${auditTrailRecorded} isolationEvents=${isolationEvents.length}`);
  console.log(`[TA-P12-003] decision=${report.decision}`);
  console.log(`[TA-P12-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 12 revoked DID isolation check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P12-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});
