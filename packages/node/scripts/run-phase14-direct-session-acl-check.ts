import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashDid } from '@telagent/protocol';

import { ApiServer } from '../src/api/server.js';
import type { RuntimeContext } from '../src/api/types.js';
import { NodeMonitoringService } from '../src/services/node-monitoring-service.js';
import { MessageService } from '../src/services/message-service.js';

interface Phase14DirectAclReport {
  phase: 'Phase 14';
  taskId: 'TA-P14-004';
  generatedAt: string;
  summary: {
    firstTwoParticipantsAccepted: boolean;
    nonParticipantRejectedRfc7807: boolean;
    existingParticipantAcceptedAfterRejection: boolean;
    rejectedErrorCode: string | null;
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

class FakeIdentityService {
  async getSelf() {
    return {
      did: 'did:claw:zSelf',
      didHash: hashDid('did:claw:zSelf'),
      controller: `0x${'1'.repeat(40)}`,
      publicKey: '0x11',
      isActive: true,
      resolvedAtMs: Date.now(),
    };
  }

  async resolve(did: string) {
    return {
      did,
      didHash: hashDid(did),
      controller: `0x${'2'.repeat(40)}`,
      publicKey: '0x22',
      isActive: true,
      resolvedAtMs: Date.now(),
    };
  }
}

class FakeGroupService {
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
  getGroup() {
    throw new Error('not used');
  }
  listGroups() {
    return [];
  }
  listMembers() {
    return [];
  }
  getChainState() {
    throw new Error('not used');
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
  assertCanUseKey() {
    return {
      did: 'did:claw:zSelf',
      suite: 'signal',
      keyId: 'mailbox-direct',
      publicKey: '0x11',
      state: 'ACTIVE',
      createdAtMs: Date.now(),
      activatedAtMs: Date.now(),
    };
  }

  registerKey() {
    return this.assertCanUseKey();
  }

  rotateKey() {
    return {
      previous: this.assertCanUseKey(),
      current: this.assertCanUseKey(),
    };
  }

  revokeKey() {
    return {
      ...this.assertCanUseKey(),
      state: 'REVOKED',
    };
  }

  recoverKey() {
    return {
      revoked: {
        ...this.assertCanUseKey(),
        state: 'RECOVERED',
      },
      recovered: this.assertCanUseKey(),
    };
  }

  listKeys() {
    return [this.assertCanUseKey()];
  }
}

async function postJson(baseUrl: string, pathname: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function runApiCheck(): Promise<{
  pass: boolean;
  firstTwoParticipantsAccepted: boolean;
  nonParticipantRejectedRfc7807: boolean;
  existingParticipantAcceptedAfterRejection: boolean;
  rejectedStatus: number;
  rejectedContentType: string | null;
  rejectedErrorCode: string | null;
  rejectedBody: Record<string, unknown>;
}> {
  const groupService = new FakeGroupService();
  const messageService = new MessageService(groupService as unknown as ConstructorParameters<typeof MessageService>[0]);
  const context: RuntimeContext = {
    config: {
      host: '127.0.0.1',
      port: 0,
      transportMode: 'p2p-first' as const,
    },
    identityService: new FakeIdentityService() as unknown as RuntimeContext['identityService'],
    groupService: groupService as unknown as RuntimeContext['groupService'],
    gasService: new FakeGasService() as unknown as RuntimeContext['gasService'],
    messageService: messageService as unknown as RuntimeContext['messageService'],
    attachmentService: new FakeAttachmentService() as unknown as RuntimeContext['attachmentService'],
    monitoringService: new NodeMonitoringService(),
    keyLifecycleService: new FakeKeyLifecycleService() as unknown as RuntimeContext['keyLifecycleService'],
  };

  const server = new ApiServer(context);
  await server.start();

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected test server TCP address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const conversationId = 'direct:p14-acl-script';
    const firstRes = await postJson(baseUrl, '/api/v1/messages', {
      envelopeId: 'env-p14-acl-script-1',
      senderDid: 'did:claw:zAlice',
      conversationId,
      conversationType: 'direct',
      targetDomain: 'alpha.tel',
      mailboxKeyId: 'mailbox-direct',
      sealedHeader: '0x11',
      ciphertext: '0x22',
      contentType: 'text',
      ttlSec: 60,
    });
    const secondRes = await postJson(baseUrl, '/api/v1/messages', {
      envelopeId: 'env-p14-acl-script-2',
      senderDid: 'did:claw:zBob',
      conversationId,
      conversationType: 'direct',
      targetDomain: 'alpha.tel',
      mailboxKeyId: 'mailbox-direct',
      sealedHeader: '0x11',
      ciphertext: '0x23',
      contentType: 'text',
      ttlSec: 60,
    });
    const rejectedRes = await postJson(baseUrl, '/api/v1/messages', {
      envelopeId: 'env-p14-acl-script-3',
      senderDid: 'did:claw:zCarol',
      conversationId,
      conversationType: 'direct',
      targetDomain: 'alpha.tel',
      mailboxKeyId: 'mailbox-direct',
      sealedHeader: '0x11',
      ciphertext: '0x24',
      contentType: 'text',
      ttlSec: 60,
    });
    const existingAfterRejectedRes = await postJson(baseUrl, '/api/v1/messages', {
      envelopeId: 'env-p14-acl-script-4',
      senderDid: 'did:claw:zBob',
      conversationId,
      conversationType: 'direct',
      targetDomain: 'alpha.tel',
      mailboxKeyId: 'mailbox-direct',
      sealedHeader: '0x11',
      ciphertext: '0x25',
      contentType: 'text',
      ttlSec: 60,
    });

    const rejectedBody = (await rejectedRes.json()) as Record<string, unknown>;
    const rejectedErrorCode = typeof rejectedBody.code === 'string' ? rejectedBody.code : null;

    const firstTwoParticipantsAccepted = firstRes.status === 201 && secondRes.status === 201;
    const nonParticipantRejectedRfc7807 = rejectedRes.status === 403
      && /application\/problem\+json/i.test(rejectedRes.headers.get('content-type') ?? '')
      && rejectedErrorCode === 'FORBIDDEN'
      && rejectedBody.status === 403;
    const existingParticipantAcceptedAfterRejection = existingAfterRejectedRes.status === 201;

    return {
      pass: firstTwoParticipantsAccepted && nonParticipantRejectedRfc7807 && existingParticipantAcceptedAfterRejection,
      firstTwoParticipantsAccepted,
      nonParticipantRejectedRfc7807,
      existingParticipantAcceptedAfterRejection,
      rejectedStatus: rejectedRes.status,
      rejectedContentType: rejectedRes.headers.get('content-type'),
      rejectedErrorCode,
      rejectedBody,
    };
  } finally {
    await server.stop();
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P14_DIRECT_ACL_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-14/manifests/2026-03-03-p14-direct-session-acl-check.json');

  const api = await runApiCheck();
  const report: Phase14DirectAclReport = {
    phase: 'Phase 14',
    taskId: 'TA-P14-004',
    generatedAt: new Date().toISOString(),
    summary: {
      firstTwoParticipantsAccepted: api.firstTwoParticipantsAccepted,
      nonParticipantRejectedRfc7807: api.nonParticipantRejectedRfc7807,
      existingParticipantAcceptedAfterRejection: api.existingParticipantAcceptedAfterRejection,
      rejectedErrorCode: api.rejectedErrorCode,
    },
    decision: api.pass ? 'PASS' : 'FAIL',
    details: {
      api: {
        rejectedStatus: api.rejectedStatus,
        rejectedContentType: api.rejectedContentType,
        rejectedErrorCode: api.rejectedErrorCode,
        rejectedBody: api.rejectedBody,
      },
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${toJson(report)}\n`, 'utf8');

  console.log(`[TA-P14-004] firstTwoParticipantsAccepted=${report.summary.firstTwoParticipantsAccepted}`);
  console.log(`[TA-P14-004] nonParticipantRejectedRfc7807=${report.summary.nonParticipantRejectedRfc7807}`);
  console.log(`[TA-P14-004] existingParticipantAcceptedAfterRejection=${report.summary.existingParticipantAcceptedAfterRejection}`);
  console.log(`[TA-P14-004] rejectedErrorCode=${report.summary.rejectedErrorCode ?? 'none'}`);
  console.log(`[TA-P14-004] decision=${report.decision}`);
  console.log(`[TA-P14-004] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 14 direct session ACL check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P14-004] execution failed');
  console.error(error);
  process.exitCode = 1;
});
