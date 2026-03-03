import assert from 'node:assert/strict';
import test from 'node:test';

import { FederationService } from './federation-service.js';
import { FederationSloService } from './federation-slo-service.js';
import { NodeMonitoringService, type NodeMonitoringClock } from './node-monitoring-service.js';

interface MutableClock extends NodeMonitoringClock {
  tick(ms: number): void;
}

function createClock(startMs = 4_000_000): MutableClock {
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

test('TA-P12-004 federation SLO runOnce auto-replays DLQ and records burn-rate metrics', () => {
  const clock = createClock();
  const federation = new FederationService({
    selfDomain: 'node-a.tel',
    clock: {
      now: () => clock.nowMs(),
    },
  });
  const monitoring = new NodeMonitoringService({
    clock,
    thresholds: {
      federationDlqErrorBudgetRatio: 0.1,
      federationDlqBurnRateWarn: 2,
      federationDlqBurnRateCritical: 4,
    },
  });

  federation.recordDlqFailure(
    'envelopes',
    {
      envelopeId: 'p12-dlq-ok',
      sourceDomain: 'node-b.tel',
      payload: 'ciphertext-1',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('temporary network timeout'),
  );
  federation.recordDlqFailure(
    'group-state-sync',
    {
      groupId: `0x${'a'.repeat(64)}`,
      state: 'INVALID_STATE',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('invalid group state payload'),
  );

  const slo = new FederationSloService(
    federation,
    monitoring,
    {
      replayIntervalSec: 60,
      replayBatchSize: 20,
      replayStopOnError: false,
    },
    { clock },
  );

  const run = slo.runOnce();
  assert.equal(run.pendingBefore, 2);
  assert.equal(run.replay.processed, 2);
  assert.equal(run.replay.replayed, 1);
  assert.equal(run.replay.failed, 1);
  assert.equal(run.pendingAfter, 1);

  const snapshot = monitoring.snapshot();
  assert.equal(snapshot.federationDlqReplay.runs, 1);
  assert.equal(snapshot.federationDlqReplay.totalProcessed, 2);
  assert.equal(snapshot.federationDlqReplay.totalReplayed, 1);
  assert.equal(snapshot.federationDlqReplay.totalFailed, 1);
  assert.equal(snapshot.federationDlqReplay.burnRate, 5);
  assert.equal(snapshot.federationDlqReplay.lastPendingAfter, 1);

  const burnRateAlert = snapshot.alerts.find((item) => item.code === 'FEDERATION_DLQ_BURN_RATE');
  assert.equal(burnRateAlert?.level, 'CRITICAL');
});

test('TA-P12-004 federation SLO scheduler periodically replays DLQ', async (t) => {
  let pending = 1;
  const federationStub = {
    listDlqEntries() {
      return pending > 0 ? ([{ dlqId: 'x' }] as unknown as ReturnType<FederationService['listDlqEntries']>) : [];
    },
    replayDlq() {
      pending = 0;
      return {
        processed: 1,
        replayed: 1,
        failed: 0,
        results: [],
      };
    },
  } as unknown as FederationService;
  const monitoring = new NodeMonitoringService();
  const scheduler = new FederationSloService(
    federationStub,
    monitoring,
    {
      replayIntervalSec: 1,
      replayBatchSize: 10,
      replayStopOnError: false,
    },
  );
  scheduler.start();
  t.after(() => {
    scheduler.stop();
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 1_100);
  });

  const snapshot = monitoring.snapshot();
  assert.ok(snapshot.federationDlqReplay.runs >= 1);
  assert.equal(snapshot.federationDlqReplay.totalReplayed >= 1, true);
});
