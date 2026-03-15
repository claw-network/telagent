import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { MessageService } from '../src/services/message-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface Phase14StablePullCursorReport {
  phase: 'Phase 14';
  taskId: 'TA-P14-003';
  generatedAt: string;
  summary: {
    conversationCursorStableAfterCleanup: boolean;
    globalCursorTokenFormat: boolean;
    globalCursorStableAfterCleanup: boolean;
    legacyOffsetRejectedInGlobalPull: boolean;
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

function createDirectInput(overrides: Partial<Parameters<MessageService['send']>[0]> = {}) {
  return {
    envelopeId: 'env-base',
    senderDid: 'did:claw:zAlice',
    conversationId: 'direct:phase14-default',
    conversationType: 'direct' as const,
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-1',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text' as const,
    ttlSec: 60,
    ...overrides,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P14_STABLE_PULL_CURSOR_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-14/manifests/2026-03-03-p14-stable-pull-cursor-check.json');

  const clock = createClock();
  const groups = {} as ConstructorParameters<typeof MessageService>[0];
  const messageService = new MessageService(groups, { clock });

  const conversationId = 'direct:p14-cursor-conversation';
  await messageService.send(createDirectInput({
    envelopeId: 'p14-conv-1',
    conversationId,
    ttlSec: 1,
  }));
  clock.tick(100);
  await messageService.send(createDirectInput({
    envelopeId: 'p14-conv-2',
    conversationId,
    ttlSec: 120,
  }));
  clock.tick(100);
  await messageService.send(createDirectInput({
    envelopeId: 'p14-conv-3',
    conversationId,
    ttlSec: 120,
  }));

  const conversationPage1 = await messageService.pull({
    conversationId,
    limit: 2,
  });
  clock.tick(1_100);
  const conversationPage2 = await messageService.pull({
    conversationId,
    limit: 2,
    cursor: conversationPage1.nextCursor ?? undefined,
  });
  const conversationCursorStableAfterCleanup =
    conversationPage1.nextCursor === '2'
    && conversationPage2.items.length === 1
    && conversationPage2.items[0]?.envelopeId === 'p14-conv-3'
    && conversationPage2.nextCursor === null;

  const globalClock = createClock(1_772_582_500_000);
  const globalMessageService = new MessageService(groups, { clock: globalClock });

  await globalMessageService.send(createDirectInput({
    envelopeId: 'p14-global-1',
    conversationId: 'direct:p14-global-a',
    ttlSec: 1,
  }));
  globalClock.tick(100);
  await globalMessageService.send(createDirectInput({
    envelopeId: 'p14-global-2',
    conversationId: 'direct:p14-global-b',
    ttlSec: 120,
  }));
  globalClock.tick(100);
  await globalMessageService.send(createDirectInput({
    envelopeId: 'p14-global-3',
    conversationId: 'direct:p14-global-c',
    ttlSec: 120,
  }));

  const globalPage1 = await globalMessageService.pull({ limit: 2 });
  const globalCursorTokenFormat = typeof globalPage1.nextCursor === 'string' && globalPage1.nextCursor.startsWith('g1.');

  globalClock.tick(1_100);
  const globalPage2 = await globalMessageService.pull({
    limit: 2,
    cursor: globalPage1.nextCursor ?? undefined,
  });
  const globalCursorStableAfterCleanup =
    globalPage2.items.length === 1
    && globalPage2.items[0]?.envelopeId === 'p14-global-3'
    && globalPage2.nextCursor === null;

  let legacyOffsetRejectedInGlobalPull = false;
  let rejectedErrorCode: string | null = null;
  try {
    await globalMessageService.pull({ limit: 2, cursor: '2' });
  } catch (error) {
    if (error instanceof TelagentError) {
      rejectedErrorCode = error.code;
      legacyOffsetRejectedInGlobalPull = error.code === ErrorCodes.VALIDATION;
    }
  }

  const report: Phase14StablePullCursorReport = {
    phase: 'Phase 14',
    taskId: 'TA-P14-003',
    generatedAt: new Date().toISOString(),
    summary: {
      conversationCursorStableAfterCleanup,
      globalCursorTokenFormat,
      globalCursorStableAfterCleanup,
      legacyOffsetRejectedInGlobalPull,
      rejectedErrorCode,
    },
    decision:
      conversationCursorStableAfterCleanup
      && globalCursorTokenFormat
      && globalCursorStableAfterCleanup
      && legacyOffsetRejectedInGlobalPull
        ? 'PASS'
        : 'FAIL',
    details: {
      conversation: {
        page1EnvelopeIds: conversationPage1.items.map((item) => item.envelopeId),
        page1NextCursor: conversationPage1.nextCursor,
        page2EnvelopeIds: conversationPage2.items.map((item) => item.envelopeId),
        page2NextCursor: conversationPage2.nextCursor,
      },
      global: {
        page1EnvelopeIds: globalPage1.items.map((item) => item.envelopeId),
        page1NextCursor: globalPage1.nextCursor,
        page2EnvelopeIds: globalPage2.items.map((item) => item.envelopeId),
        page2NextCursor: globalPage2.nextCursor,
      },
      globalLegacyCursorRejection: {
        rejectedErrorCode,
      },
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${toJson(report)}\n`, 'utf8');

  console.log(`[TA-P14-003] conversationCursorStableAfterCleanup=${conversationCursorStableAfterCleanup}`);
  console.log(`[TA-P14-003] globalCursorTokenFormat=${globalCursorTokenFormat}`);
  console.log(`[TA-P14-003] globalCursorStableAfterCleanup=${globalCursorStableAfterCleanup}`);
  console.log(`[TA-P14-003] legacyOffsetRejectedInGlobalPull=${legacyOffsetRejectedInGlobalPull} code=${rejectedErrorCode ?? 'none'}`);
  console.log(`[TA-P14-003] decision=${report.decision}`);
  console.log(`[TA-P14-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 14 stable pull cursor check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P14-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});
