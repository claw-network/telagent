import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FederationService } from '../src/services/federation-service.js';
import { FederationSloService } from '../src/services/federation-slo-service.js';
import { NodeMonitoringService, type NodeMonitoringClock } from '../src/services/node-monitoring-service.js';

interface MutableClock extends NodeMonitoringClock {
  tick(ms: number): void;
}

interface Phase12FederationSloReport {
  phase: 'Phase 12';
  taskId: 'TA-P12-004';
  generatedAt: string;
  summary: {
    autoReplayPass: boolean;
    burnRateWarnPass: boolean;
    burnRateCriticalPass: boolean;
    schedulerTickPass: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function createClock(startMs = 1_772_582_500_000): MutableClock {
  let nowMs = startMs;
  return {
    nowMs() {
      return nowMs;
    },
    tick(ms: number) {
      nowMs += ms;
    },
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function createDlqSeedHelpers(service: FederationService) {
  let sequence = 0;

  return {
    seedReplayable(count: number) {
      for (let index = 0; index < count; index++) {
        sequence += 1;
        service.recordDlqFailure(
          'envelopes',
          {
            envelopeId: `p12-slo-replayable-${sequence}`,
            sourceDomain: 'node-b.tel',
            payload: `ciphertext-${sequence}`,
          },
          {
            sourceDomain: 'node-b.tel',
          },
          new Error('temporary federation timeout'),
        );
      }
    },
    seedNonReplayable(count: number) {
      for (let index = 0; index < count; index++) {
        sequence += 1;
        service.recordDlqFailure(
          'group-state-sync',
          {
            groupId: `0x${String(sequence).padStart(64, '0')}`,
            state: 'INVALID_STATE',
            sourceDomain: 'node-b.tel',
          },
          {
            sourceDomain: 'node-b.tel',
          },
          new Error('invalid payload'),
        );
      }
    },
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P12_FEDERATION_SLO_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-12/manifests/2026-03-03-p12-federation-slo-automation-check.json');

  const clock = createClock();
  const federationService = new FederationService({
    selfDomain: 'node-a.tel',
    clock: {
      now: () => clock.nowMs(),
    },
  });
  const monitoringService = new NodeMonitoringService({
    clock,
    thresholds: {
      federationDlqErrorBudgetRatio: 0.1,
      federationDlqBurnRateWarn: 2,
      federationDlqBurnRateCritical: 4,
    },
  });
  const sloService = new FederationSloService(
    federationService,
    monitoringService,
    {
      replayIntervalSec: 1,
      replayBatchSize: 100,
      replayStopOnError: false,
    },
    { clock },
  );

  const seed = createDlqSeedHelpers(federationService);

  seed.seedReplayable(8);
  seed.seedNonReplayable(2);
  const warnRun = sloService.runOnce();
  const warnSnapshot = monitoringService.snapshot();
  const warnAlert = warnSnapshot.alerts.find((item) => item.code === 'FEDERATION_DLQ_BURN_RATE');

  clock.tick(1_000);
  seed.seedReplayable(4);
  seed.seedNonReplayable(6);
  const criticalRun = sloService.runOnce();
  const criticalSnapshot = monitoringService.snapshot();
  const criticalAlert = criticalSnapshot.alerts.find((item) => item.code === 'FEDERATION_DLQ_BURN_RATE');
  const warnBurnRate = warnSnapshot.federationDlqReplay.burnRate;
  const criticalBurnRate = criticalSnapshot.federationDlqReplay.burnRate;

  clock.tick(1_000);
  seed.seedReplayable(1);
  const pendingBeforeScheduler = federationService.listDlqEntries({ status: 'PENDING' }).length;
  const runsBeforeScheduler = criticalSnapshot.federationDlqReplay.runs;
  sloService.start();
  await new Promise((resolve) => {
    setTimeout(resolve, 1_100);
  });
  sloService.stop();

  const finalSnapshot = monitoringService.snapshot();
  const pendingAfterScheduler = federationService.listDlqEntries({ status: 'PENDING' }).length;
  const schedulerRunsDelta = finalSnapshot.federationDlqReplay.runs - runsBeforeScheduler;

  const burnRateWarnPass = warnRun.replay.processed > 0
    && warnRun.replay.replayed > 0
    && warnRun.replay.failed > 0
    && warnAlert?.level === 'WARN'
    && warnBurnRate >= 2;
  const burnRateCriticalPass = criticalRun.replay.processed >= warnRun.replay.processed
    && criticalRun.replay.failed > warnRun.replay.failed
    && criticalAlert?.level === 'CRITICAL'
    && criticalBurnRate > warnBurnRate;
  const schedulerTickPass = schedulerRunsDelta >= 1;
  const autoReplayPass = pendingAfterScheduler < pendingBeforeScheduler;

  const report: Phase12FederationSloReport = {
    phase: 'Phase 12',
    taskId: 'TA-P12-004',
    generatedAt: new Date().toISOString(),
    summary: {
      autoReplayPass,
      burnRateWarnPass,
      burnRateCriticalPass,
      schedulerTickPass,
    },
    decision:
      autoReplayPass
      && burnRateWarnPass
      && burnRateCriticalPass
      && schedulerTickPass
        ? 'PASS'
        : 'FAIL',
    details: {
      warnRun,
      criticalRun,
      warnAlert,
      criticalAlert,
      warnBurnRate,
      criticalBurnRate,
      pendingBeforeScheduler,
      pendingAfterScheduler,
      schedulerRunsDelta,
      finalFederationDlq: federationService.nodeInfo().dlq,
      finalMonitoringReplay: finalSnapshot.federationDlqReplay,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${toJson(report)}\n`, 'utf8');

  console.log(`[TA-P12-004] autoReplayPass=${autoReplayPass} pendingBefore=${pendingBeforeScheduler} pendingAfter=${pendingAfterScheduler}`);
  console.log(`[TA-P12-004] burnRateWarnPass=${burnRateWarnPass} burnRateCriticalPass=${burnRateCriticalPass}`);
  console.log(`[TA-P12-004] schedulerTickPass=${schedulerTickPass} schedulerRunsDelta=${schedulerRunsDelta}`);
  console.log(`[TA-P12-004] decision=${report.decision}`);
  console.log(`[TA-P12-004] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 12 federation SLO automation check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P12-004] execution failed');
  console.error(error);
  process.exitCode = 1;
});
