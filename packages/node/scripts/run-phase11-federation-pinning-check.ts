import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { FederationService } from '../src/services/federation-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface Phase11FederationPinningReport {
  phase: 'Phase 11';
  taskId: 'TA-P11-004';
  generatedAt: string;
  summary: {
    missingKeyRejected: boolean;
    unknownKeyRejected: boolean;
    currentKeyAcceptedPreCutover: boolean;
    nextKeyAcceptedPreCutover: boolean;
    currentKeyRejectedPostCutover: boolean;
    nextKeyAcceptedPostCutover: boolean;
    nodeInfoPinningPublished: boolean;
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

function assertTelagentError(error: unknown): TelagentError {
  if (!(error instanceof TelagentError)) {
    throw new Error(`expected TelagentError, got ${String(error)}`);
  }
  return error;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P11_PINNING_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-11/manifests/2026-03-03-p11-federation-pinning-check.json');

  const clock = createClock();
  const cutoverAtMs = clock.now() + 120_000;
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    pinningMode: 'enforced',
    pinningCurrentKeysByDomain: {
      'node-b.tel': ['node-b-key-v1'],
    },
    pinningNextKeysByDomain: {
      'node-b.tel': ['node-b-key-v2'],
    },
    pinningCutoverAtMs: cutoverAtMs,
    clock,
  });

  const sendEnvelope = (envelopeId: string, sourceKeyId?: string) =>
    service.receiveEnvelope(
      {
        envelopeId,
        sourceDomain: 'node-b.tel',
      },
      {
        sourceDomain: 'node-b.tel',
        sourceKeyId,
      },
    );

  let missingKeyRejected = false;
  let missingKeyErrorCode: string | null = null;
  try {
    sendEnvelope('p11-pin-missing-key');
  } catch (error) {
    const typed = assertTelagentError(error);
    missingKeyRejected = typed.code === ErrorCodes.UNAUTHORIZED;
    missingKeyErrorCode = typed.code;
  }

  let unknownKeyRejected = false;
  let unknownKeyErrorCode: string | null = null;
  try {
    sendEnvelope('p11-pin-unknown-key', 'node-b-key-unknown');
  } catch (error) {
    const typed = assertTelagentError(error);
    unknownKeyRejected = typed.code === ErrorCodes.FORBIDDEN;
    unknownKeyErrorCode = typed.code;
  }

  const currentKeyAcceptedPreCutover = sendEnvelope('p11-pin-current-pre', 'node-b-key-v1').accepted;
  const nextKeyAcceptedPreCutover = sendEnvelope('p11-pin-next-pre', 'node-b-key-v2').accepted;

  clock.tick(120_000);

  let currentKeyRejectedPostCutover = false;
  let postCutoverErrorCode: string | null = null;
  try {
    sendEnvelope('p11-pin-current-post', 'node-b-key-v1');
  } catch (error) {
    const typed = assertTelagentError(error);
    currentKeyRejectedPostCutover = typed.code === ErrorCodes.FORBIDDEN;
    postCutoverErrorCode = typed.code;
  }
  const nextKeyAcceptedPostCutover = sendEnvelope('p11-pin-next-post', 'node-b-key-v2').accepted;

  const nodeInfo = service.nodeInfo();
  const nodeInfoPinningPublished =
    nodeInfo.security.pinning.mode === 'enforced'
    && nodeInfo.security.pinning.configuredDomains.includes('node-b.tel')
    && nodeInfo.security.pinning.cutoverReached === true;

  const report: Phase11FederationPinningReport = {
    phase: 'Phase 11',
    taskId: 'TA-P11-004',
    generatedAt: new Date().toISOString(),
    summary: {
      missingKeyRejected,
      unknownKeyRejected,
      currentKeyAcceptedPreCutover,
      nextKeyAcceptedPreCutover,
      currentKeyRejectedPostCutover,
      nextKeyAcceptedPostCutover,
      nodeInfoPinningPublished,
    },
    decision:
      missingKeyRejected
      && unknownKeyRejected
      && currentKeyAcceptedPreCutover
      && nextKeyAcceptedPreCutover
      && currentKeyRejectedPostCutover
      && nextKeyAcceptedPostCutover
      && nodeInfoPinningPublished
        ? 'PASS'
        : 'FAIL',
    details: {
      cutoverAt: new Date(cutoverAtMs).toISOString(),
      pinningStats: nodeInfo.security.pinning.stats,
      missingKeyErrorCode,
      unknownKeyErrorCode,
      postCutoverErrorCode,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P11-004] missingKeyRejected=${missingKeyRejected} unknownKeyRejected=${unknownKeyRejected}`);
  console.log(`[TA-P11-004] preCutover(current,next)=(${currentKeyAcceptedPreCutover},${nextKeyAcceptedPreCutover})`);
  console.log(`[TA-P11-004] postCutover(current,next)=(${currentKeyRejectedPostCutover},${nextKeyAcceptedPostCutover})`);
  console.log(`[TA-P11-004] decision=${report.decision}`);
  console.log(`[TA-P11-004] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 11 federation pinning check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P11-004] execution failed');
  console.error(error);
  process.exitCode = 1;
});
