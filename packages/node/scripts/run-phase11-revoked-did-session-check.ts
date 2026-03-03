import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { MessageService } from '../src/services/message-service.js';

interface MutableClock {
  now(): number;
}

interface Phase11RevokedDidSessionReport {
  phase: 'Phase 11';
  taskId: 'TA-P11-007';
  generatedAt: string;
  summary: {
    preRevokeSendSuccess: boolean;
    postRevokeSendBlocked: boolean;
    mailboxIsolationAfterRevoke: boolean;
    blockedErrorCode: string | null;
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

class MutableIdentityService {
  private readonly revoked = new Set<string>();

  revoke(did: string) {
    this.revoked.add(did);
  }

  async assertActiveDid(rawDid: string): Promise<void> {
    if (this.revoked.has(rawDid)) {
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'DID is revoked or inactive');
    }
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P11_REVOKED_DID_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-11/manifests/2026-03-03-p11-revoked-did-session-check.json');

  const identityService = new MutableIdentityService();
  const messageService = new MessageService({} as ConstructorParameters<typeof MessageService>[0], {
    clock: createClock(),
    identityService,
  });
  const did = 'did:claw:zRevokedCase';
  const conversationId = 'direct:revoked-case';

  let preRevokeSendSuccess = false;
  try {
    await messageService.send({
      envelopeId: 'p11-revoked-did-send-1',
      senderDid: did,
      conversationId,
      conversationType: 'direct',
      targetDomain: 'node-a.tel',
      mailboxKeyId: 'signal-key-v1',
      sealedHeader: '0x11',
      ciphertext: '0x22',
      contentType: 'text',
      ttlSec: 60,
    });
    preRevokeSendSuccess = true;
  } catch {
    preRevokeSendSuccess = false;
  }

  identityService.revoke(did);

  let postRevokeSendBlocked = false;
  let blockedErrorCode: string | null = null;
  try {
    await messageService.send({
      envelopeId: 'p11-revoked-did-send-2',
      senderDid: did,
      conversationId,
      conversationType: 'direct',
      targetDomain: 'node-a.tel',
      mailboxKeyId: 'signal-key-v1',
      sealedHeader: '0x11',
      ciphertext: '0x33',
      contentType: 'text',
      ttlSec: 60,
    });
  } catch (error) {
    if (error instanceof TelagentError) {
      blockedErrorCode = error.code;
      postRevokeSendBlocked = error.code === ErrorCodes.UNPROCESSABLE;
    }
  }

  const mailbox = await messageService.pull({ conversationId, limit: 10 });
  const mailboxIsolationAfterRevoke = mailbox.items.length === 1
    && mailbox.items[0].envelopeId === 'p11-revoked-did-send-1';

  const report: Phase11RevokedDidSessionReport = {
    phase: 'Phase 11',
    taskId: 'TA-P11-007',
    generatedAt: new Date().toISOString(),
    summary: {
      preRevokeSendSuccess,
      postRevokeSendBlocked,
      mailboxIsolationAfterRevoke,
      blockedErrorCode,
    },
    decision:
      preRevokeSendSuccess
      && postRevokeSendBlocked
      && mailboxIsolationAfterRevoke
        ? 'PASS'
        : 'FAIL',
    details: {
      did,
      conversationId,
      mailboxItems: mailbox.items,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${toJson(report)}\n`, 'utf8');

  console.log(`[TA-P11-007] preRevokeSendSuccess=${preRevokeSendSuccess}`);
  console.log(`[TA-P11-007] postRevokeSendBlocked=${postRevokeSendBlocked} blockedErrorCode=${blockedErrorCode ?? 'none'}`);
  console.log(`[TA-P11-007] mailboxIsolationAfterRevoke=${mailboxIsolationAfterRevoke}`);
  console.log(`[TA-P11-007] decision=${report.decision}`);
  console.log(`[TA-P11-007] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 11 revoked DID session check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P11-007] execution failed');
  console.error(error);
  process.exitCode = 1;
});
