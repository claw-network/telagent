import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { KeyLifecycleService } from '../src/services/key-lifecycle-service.js';
import { MessageService } from '../src/services/message-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface Phase11KeyLifecycleReport {
  phase: 'Phase 11';
  taskId: 'TA-P11-006';
  generatedAt: string;
  summary: {
    rotateGraceAccepted: boolean;
    rotatedOldKeyBlocked: boolean;
    newKeyActive: boolean;
    revokedKeyBlocked: boolean;
    recoveredKeyActive: boolean;
    messageSendWithRecoveredKey: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
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

function keyHex(seed: string): string {
  return `0x${seed.repeat(64)}`;
}

function isForbidden(error: unknown): boolean {
  return error instanceof TelagentError && error.code === ErrorCodes.FORBIDDEN;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P11_KEY_LIFECYCLE_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-11/manifests/2026-03-03-p11-key-lifecycle-check.json');

  const clock = createClock();
  const keyLifecycle = new KeyLifecycleService({
    clock,
    defaultSignalGraceSec: 60,
    defaultMlsGraceSec: 60,
  });

  const did = 'did:claw:zLifecycle';
  keyLifecycle.registerKey({
    did,
    suite: 'signal',
    keyId: 'signal-key-v1',
    publicKey: keyHex('1'),
  });

  keyLifecycle.rotateKey({
    did,
    suite: 'signal',
    fromKeyId: 'signal-key-v1',
    toKeyId: 'signal-key-v2',
    publicKey: keyHex('2'),
    gracePeriodSec: 60,
  });

  let rotateGraceAccepted = false;
  try {
    keyLifecycle.assertCanUseKey({
      did,
      suite: 'signal',
      keyId: 'signal-key-v1',
    });
    rotateGraceAccepted = true;
  } catch {
    rotateGraceAccepted = false;
  }

  clock.tick(61_000);
  let rotatedOldKeyBlocked = false;
  try {
    keyLifecycle.assertCanUseKey({
      did,
      suite: 'signal',
      keyId: 'signal-key-v1',
    });
  } catch (error) {
    rotatedOldKeyBlocked = isForbidden(error);
  }

  let newKeyActive = false;
  try {
    keyLifecycle.assertCanUseKey({
      did,
      suite: 'signal',
      keyId: 'signal-key-v2',
    });
    newKeyActive = true;
  } catch {
    newKeyActive = false;
  }

  keyLifecycle.revokeKey({
    did,
    suite: 'signal',
    keyId: 'signal-key-v2',
    reason: 'device reset',
  });

  let revokedKeyBlocked = false;
  try {
    keyLifecycle.assertCanUseKey({
      did,
      suite: 'signal',
      keyId: 'signal-key-v2',
    });
  } catch (error) {
    revokedKeyBlocked = isForbidden(error);
  }

  keyLifecycle.recoverKey({
    did,
    suite: 'signal',
    revokedKeyId: 'signal-key-v2',
    recoveredKeyId: 'signal-key-v3',
    publicKey: keyHex('3'),
  });

  let recoveredKeyActive = false;
  try {
    keyLifecycle.assertCanUseKey({
      did,
      suite: 'signal',
      keyId: 'signal-key-v3',
    });
    recoveredKeyActive = true;
  } catch {
    recoveredKeyActive = false;
  }

  const messageService = new MessageService({} as ConstructorParameters<typeof MessageService>[0], {
    clock,
    keyLifecycleService: keyLifecycle,
  });

  let messageSendWithRecoveredKey = false;
  try {
    await messageService.send({
      envelopeId: 'p11-key-life-send-1',
      senderDid: did,
      conversationId: 'direct:lifecycle',
      conversationType: 'direct',
      targetDomain: 'node-a.tel',
      mailboxKeyId: 'signal-key-v3',
      sealedHeader: '0x11',
      ciphertext: '0x22',
      contentType: 'text',
      ttlSec: 60,
    });
    messageSendWithRecoveredKey = true;
  } catch {
    messageSendWithRecoveredKey = false;
  }

  const report: Phase11KeyLifecycleReport = {
    phase: 'Phase 11',
    taskId: 'TA-P11-006',
    generatedAt: new Date().toISOString(),
    summary: {
      rotateGraceAccepted,
      rotatedOldKeyBlocked,
      newKeyActive,
      revokedKeyBlocked,
      recoveredKeyActive,
      messageSendWithRecoveredKey,
    },
    decision:
      rotateGraceAccepted
      && rotatedOldKeyBlocked
      && newKeyActive
      && revokedKeyBlocked
      && recoveredKeyActive
      && messageSendWithRecoveredKey
        ? 'PASS'
        : 'FAIL',
    details: {
      did,
      keyStates: keyLifecycle.listKeys(did, 'signal'),
      clockNow: clock.now(),
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P11-006] rotateGraceAccepted=${rotateGraceAccepted} rotatedOldKeyBlocked=${rotatedOldKeyBlocked}`);
  console.log(`[TA-P11-006] newKeyActive=${newKeyActive} revokedKeyBlocked=${revokedKeyBlocked} recoveredKeyActive=${recoveredKeyActive}`);
  console.log(`[TA-P11-006] messageSendWithRecoveredKey=${messageSendWithRecoveredKey}`);
  console.log(`[TA-P11-006] decision=${report.decision}`);
  console.log(`[TA-P11-006] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 11 key lifecycle check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P11-006] execution failed');
  console.error(error);
  process.exitCode = 1;
});
