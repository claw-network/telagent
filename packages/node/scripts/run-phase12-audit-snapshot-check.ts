import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashDid } from '@telagent/protocol';

import { ApiServer } from '../src/api/server.js';
import type { RuntimeContext } from '../src/api/types.js';
import { MessageService } from '../src/services/message-service.js';
import { NodeMonitoringService } from '../src/services/node-monitoring-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface Phase12AuditSnapshotReport {
  phase: 'Phase 12';
  taskId: 'TA-P12-002';
  generatedAt: string;
  summary: {
    serviceHashingPass: boolean;
    apiEnvelopePass: boolean;
    apiDesensitizedPass: boolean;
    apiQueryValidationPass: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: {
    service: Record<string, unknown>;
    api: Record<string, unknown>;
  };
}

function digest(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function createClock(startMs = 1_772_582_400_000): MutableClock {
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

function ensure(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function runServiceSnapshotCheck() {
  const groupId = `0x${'d'.repeat(64)}`;
  const clock = createClock();

  const stateByGroup = new Map<string, 'PENDING_ONCHAIN' | 'ACTIVE' | 'REORGED_BACK'>();
  stateByGroup.set(groupId, 'PENDING_ONCHAIN');

  const groupHarness = {
    getChainState(targetGroupId: string) {
      const state = stateByGroup.get(targetGroupId);
      if (!state) {
        throw new Error(`group(${targetGroupId}) not found`);
      }
      return {
        groupId: targetGroupId,
        state,
        updatedAtMs: clock.now(),
      };
    },
    listMembers(targetGroupId: string) {
      return [
        {
          groupId: targetGroupId,
          did: 'did:claw:zAudit',
          didHash: hashDid('did:claw:zAudit'),
          state: 'FINALIZED' as const,
          joinedAtMs: clock.now(),
        },
      ];
    },
  } as unknown as ConstructorParameters<typeof MessageService>[0];

  const messageService = new MessageService(groupHarness, { clock });

  await messageService.send({
    envelopeId: 'audit-env-1',
    senderDid: 'did:claw:zAudit',
    conversationId: `group:${groupId}`,
    conversationType: 'group',
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-audit',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text',
    ttlSec: 300,
  });

  stateByGroup.set(groupId, 'REORGED_BACK');
  await messageService.pull({
    conversationId: `group:${groupId}`,
    limit: 20,
  });

  const snapshot = await messageService.buildAuditSnapshot({
    sampleSize: 1,
    retractionScanLimit: 20,
  });

  const expectedEnvelopeHash = digest('audit-env-1');
  const expectedConversationHash = digest(`group:${groupId}`);

  const serviceHashingPass =
    snapshot.retractedCount === 1
    && snapshot.retractedByReason.REORGED_BACK === 1
    && snapshot.sampledRetractions.length === 1
    && snapshot.sampledRetractions[0].envelopeIdHash === expectedEnvelopeHash
    && snapshot.sampledRetractions[0].conversationIdHash === expectedConversationHash;

  return {
    pass: serviceHashingPass,
    groupId,
    snapshot,
    expectedEnvelopeHash,
    expectedConversationHash,
  };
}

async function runApiSnapshotCheck(serviceSnapshot: Awaited<ReturnType<typeof runServiceSnapshotCheck>>) {
  class FakeIdentityService {
    async getSelf() {
      return {
        did: 'did:claw:zSelf',
        didHash: `0x${'1'.repeat(64)}`,
        controller: `0x${'2'.repeat(40)}`,
        publicKey: '0x11',
        isActive: true,
        resolvedAtMs: Date.now(),
      };
    }

    async resolve(did: string) {
      return {
        did,
        didHash: `0x${'3'.repeat(64)}`,
        controller: `0x${'4'.repeat(40)}`,
        publicKey: '0x22',
        isActive: true,
        resolvedAtMs: Date.now(),
      };
    }
  }

  class FakeGroupService {
    listGroups() {
      return [
        {
          groupId: `0x${'b'.repeat(64)}`,
          creatorDid: 'did:claw:zSelf',
          creatorDidHash: `0x${'1'.repeat(64)}`,
          groupDomain: 'alpha.tel',
          domainProofHash: `0x${'5'.repeat(64)}`,
          initialMlsStateHash: `0x${'6'.repeat(64)}`,
          state: 'ACTIVE' as const,
          createdAtMs: Date.now(),
          txHash: `0x${'7'.repeat(64)}`,
          blockNumber: 100,
        },
        {
          groupId: `0x${'c'.repeat(64)}`,
          creatorDid: 'did:claw:zSelf',
          creatorDidHash: `0x${'1'.repeat(64)}`,
          groupDomain: 'beta.tel',
          domainProofHash: `0x${'8'.repeat(64)}`,
          initialMlsStateHash: `0x${'9'.repeat(64)}`,
          state: 'PENDING_ONCHAIN' as const,
          createdAtMs: Date.now(),
          txHash: `0x${'a'.repeat(64)}`,
          blockNumber: 101,
        },
      ];
    }

    listMembers(groupId: string) {
      if (groupId === `0x${'c'.repeat(64)}`) {
        return [
          {
            groupId,
            did: 'did:claw:zMember2',
            didHash: `0x${'b'.repeat(64)}`,
            state: 'PENDING' as const,
            joinedAtMs: Date.now(),
          },
        ];
      }

      return [
        {
          groupId,
          did: 'did:claw:zMember1',
          didHash: `0x${'c'.repeat(64)}`,
          state: 'FINALIZED' as const,
          joinedAtMs: Date.now(),
        },
      ];
    }

    getChainState(groupId: string) {
      return {
        groupId,
        state: 'ACTIVE' as const,
        finalizedTxHash: `0x${'d'.repeat(64)}`,
        blockNumber: 100,
        updatedAtMs: Date.now(),
      };
    }

    getGroup(groupId: string) {
      return {
        groupId,
        creatorDid: 'did:claw:zSelf',
        creatorDidHash: `0x${'1'.repeat(64)}`,
        groupDomain: 'alpha.tel',
        domainProofHash: `0x${'5'.repeat(64)}`,
        initialMlsStateHash: `0x${'6'.repeat(64)}`,
        state: 'ACTIVE' as const,
        createdAtMs: Date.now(),
        txHash: `0x${'7'.repeat(64)}`,
        blockNumber: 100,
      };
    }

    createGroup() {
      throw new Error('not used');
    }
    inviteMember() {
      throw new Error('not used');
    }
    acceptInvite() {
      throw new Error('not used');
    }
    removeMember() {
      throw new Error('not used');
    }
  }

  class FakeMessageService {
    async buildAuditSnapshot() {
      return serviceSnapshot.snapshot;
    }

    send() {
      throw new Error('not used');
    }

    pull() {
      return {
        items: [],
        nextCursor: null,
      };
    }

    listRetracted() {
      return [];
    }
  }

  class FakeGasService {
    async getNativeGasBalance() {
      return 1_000_000n;
    }

    async getTokenBalance() {
      return 1_000_000n;
    }
  }

  class FakeAttachmentService {
    initUpload() {
      throw new Error('not used');
    }

    completeUpload() {
      throw new Error('not used');
    }
  }

  class FakeKeyLifecycleService {
    registerKey() {
      throw new Error('not used');
    }

    rotateKey() {
      throw new Error('not used');
    }

    revokeKey() {
      throw new Error('not used');
    }

    recoverKey() {
      throw new Error('not used');
    }

    listKeys() {
      return [];
    }

    assertCanUseKey() {
      return true;
    }
  }

  const context: RuntimeContext = {
    config: {
      host: '127.0.0.1',
      port: 0,
      transportMode: 'p2p-first' as const,
    },
    identityService: new FakeIdentityService() as unknown as RuntimeContext['identityService'],
    groupService: new FakeGroupService() as unknown as RuntimeContext['groupService'],
    gasService: new FakeGasService() as unknown as RuntimeContext['gasService'],
    messageService: new FakeMessageService() as unknown as RuntimeContext['messageService'],
    attachmentService: new FakeAttachmentService() as unknown as RuntimeContext['attachmentService'],
    monitoringService: new NodeMonitoringService(),
    keyLifecycleService: new FakeKeyLifecycleService() as unknown as RuntimeContext['keyLifecycleService'],
  };

  const server = new ApiServer(context);
  await server.start();

  const address = server.httpServer?.address();
  ensure(address && typeof address !== 'string', 'expected test server TCP address');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const successRes = await fetch(`${baseUrl}/api/v1/node/audit-snapshot?sample_size=3&retraction_scan_limit=100`);
    ensure(successRes.status === 200, `expected 200 from audit snapshot endpoint, got ${successRes.status}`);

    const successBody = (await successRes.json()) as {
      data: Record<string, unknown>;
      links: { self: string };
    };

    const apiEnvelopePass = typeof successBody.links?.self === 'string'
      && successBody.links.self === '/api/v1/node/audit-snapshot?sample_size=3&retraction_scan_limit=100';

    const serialized = JSON.stringify(successBody.data);
    const leakedTokens = [
      'alpha.tel',
      'beta.tel',
      'node-a.tel',
      'node-b.tel',
      'audit-env-1',
      `group:${serviceSnapshot.groupId}`,
      `0x${'2'.repeat(40)}`,
    ].filter((token) => serialized.includes(token));

    const apiDesensitizedPass = leakedTokens.length === 0;

    const invalidRes = await fetch(`${baseUrl}/api/v1/node/audit-snapshot?sample_size=0`);
    const invalidBody = (await invalidRes.json()) as { status?: number; code?: string; detail?: string };
    const apiQueryValidationPass = invalidRes.status === 400
      && invalidBody.status === 400
      && invalidBody.code === 'VALIDATION_ERROR'
      && typeof invalidBody.detail === 'string'
      && invalidBody.detail.includes('sample_size');

    return {
      pass: apiEnvelopePass && apiDesensitizedPass && apiQueryValidationPass,
      apiEnvelopePass,
      apiDesensitizedPass,
      apiQueryValidationPass,
      leakedTokens,
      selfLink: successBody.links?.self,
      invalidStatus: invalidRes.status,
      invalidCode: invalidBody.code,
      invalidDetail: invalidBody.detail,
    };
  } finally {
    await server.stop();
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P12_AUDIT_SNAPSHOT_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-12/manifests/2026-03-03-p12-audit-snapshot-check.json');

  const service = await runServiceSnapshotCheck();
  const api = await runApiSnapshotCheck(service);

  const report: Phase12AuditSnapshotReport = {
    phase: 'Phase 12',
    taskId: 'TA-P12-002',
    generatedAt: new Date().toISOString(),
    summary: {
      serviceHashingPass: service.pass,
      apiEnvelopePass: api.apiEnvelopePass,
      apiDesensitizedPass: api.apiDesensitizedPass,
      apiQueryValidationPass: api.apiQueryValidationPass,
    },
    decision: service.pass && api.pass ? 'PASS' : 'FAIL',
    details: {
      service: {
        groupId: service.groupId,
        snapshot: service.snapshot,
        expectedEnvelopeHash: service.expectedEnvelopeHash,
        expectedConversationHash: service.expectedConversationHash,
      },
      api: {
        selfLink: api.selfLink,
        leakedTokens: api.leakedTokens,
        invalidStatus: api.invalidStatus,
        invalidCode: api.invalidCode,
        invalidDetail: api.invalidDetail,
      },
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P12-002] serviceHashingPass=${report.summary.serviceHashingPass}`);
  console.log(`[TA-P12-002] apiEnvelopePass=${report.summary.apiEnvelopePass}`);
  console.log(`[TA-P12-002] apiDesensitizedPass=${report.summary.apiDesensitizedPass}`);
  console.log(`[TA-P12-002] apiQueryValidationPass=${report.summary.apiQueryValidationPass}`);
  console.log(`[TA-P12-002] decision=${report.decision}`);
  console.log(`[TA-P12-002] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 12 audit snapshot check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P12-002] execution failed');
  console.error(error);
  process.exitCode = 1;
});
