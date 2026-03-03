import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes } from '@telagent/protocol';

import { FederationService } from '../src/services/federation-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface Phase13FederationProtectionReport {
  phase: 'Phase 13';
  taskId: 'TA-P13-005';
  generatedAt: string;
  summary: {
    backoffScheduledPass: boolean;
    circuitOpenedPass: boolean;
    blockedWhileOpenPass: boolean;
    recoveredAfterCooldownPass: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function createClock(startMs = 1_772_591_400_000): MutableClock {
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

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P13_FEDERATION_PROTECTION_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-13/manifests/2026-03-03-p13-federation-protection-check.json');

  const clock = createClock();
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    replayBackoffBaseMs: 1_000,
    replayBackoffMaxMs: 4_000,
    replayCircuitBreakerFailureThreshold: 2,
    replayCircuitBreakerCooldownMs: 20_000,
    clock,
  });

  const firstSeed = service.recordDlqFailure(
    'envelopes',
    {
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('seed-failure-1'),
  );

  const firstReplay = service.replayDlq();
  const pendingAfterFirst = service.listDlqEntries({ status: 'PENDING' });
  const firstPendingEntry = pendingAfterFirst.find((entry) => entry.dlqId === firstSeed.dlqId);
  const backoffScheduledPass = Boolean(firstPendingEntry && firstPendingEntry.nextReplayAtMs === clock.now() + 1_000);

  clock.tick(1_000);
  const secondReplay = service.replayDlq();
  const infoAfterOpen = service.nodeInfo();
  const circuitOpenedPass = secondReplay.failed === 1
    && infoAfterOpen.resilience.replayProtection.openSourceDomainCount === 1
    && infoAfterOpen.resilience.replayProtection.totalOpenEvents >= 1;

  const replayableSeed = service.recordDlqFailure(
    'envelopes',
    {
      envelopeId: 'fed-p13-protected-ok',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('seed-failure-2'),
  );

  const blockedReplay = service.replayDlq();
  const blockedWhileOpenPass = blockedReplay.processed === 1
    && blockedReplay.failed === 1
    && blockedReplay.results[0]?.errorCode === ErrorCodes.TOO_MANY_REQUESTS;

  clock.tick(20_000);
  const replayAfterCooldown = service.replayDlq({ maxItems: 10 });
  const infoAfterCooldown = service.nodeInfo();
  const recoveredAfterCooldownPass = replayAfterCooldown.replayed >= 1
    && replayAfterCooldown.results.some((item) => item.dlqId === replayableSeed.dlqId && item.status === 'REPLAYED')
    && infoAfterCooldown.resilience.replayProtection.openSourceDomainCount === 0;

  const report: Phase13FederationProtectionReport = {
    phase: 'Phase 13',
    taskId: 'TA-P13-005',
    generatedAt: new Date().toISOString(),
    summary: {
      backoffScheduledPass,
      circuitOpenedPass,
      blockedWhileOpenPass,
      recoveredAfterCooldownPass,
    },
    decision: backoffScheduledPass && circuitOpenedPass && blockedWhileOpenPass && recoveredAfterCooldownPass
      ? 'PASS'
      : 'FAIL',
    details: {
      firstReplay,
      secondReplay,
      blockedReplay,
      replayAfterCooldown,
      infoAfterOpen: infoAfterOpen.resilience.replayProtection,
      infoAfterCooldown: infoAfterCooldown.resilience.replayProtection,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-P13-005] backoffScheduledPass=${backoffScheduledPass}`);
  console.log(`[TA-P13-005] circuitOpenedPass=${circuitOpenedPass}`);
  console.log(`[TA-P13-005] blockedWhileOpenPass=${blockedWhileOpenPass}`);
  console.log(`[TA-P13-005] recoveredAfterCooldownPass=${recoveredAfterCooldownPass}`);
  console.log(`[TA-P13-005] decision=${report.decision}`);
  console.log(`[TA-P13-005] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 13 federation protection check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P13-005] execution failed');
  console.error(error);
  process.exitCode = 1;
});
