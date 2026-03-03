import assert from 'node:assert/strict';
import test from 'node:test';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { FederationService } from './federation-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

function createClock(startMs = 10_000): MutableClock {
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

test('TA-P4-007 federation envelopes support idempotent retries', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    allowedSourceDomains: ['node-b.tel'],
  });

  const first = service.receiveEnvelope(
    {
      envelopeId: 'fed-1',
      sourceDomain: 'node-b.tel',
      payload: 'ciphertext',
    },
    {
      sourceDomain: 'node-b.tel',
    },
  );
  assert.equal(first.deduplicated, false);

  const second = service.receiveEnvelope(
    {
      envelopeId: 'fed-1',
      sourceDomain: 'node-b.tel',
      payload: 'ciphertext',
    },
    {
      sourceDomain: 'node-b.tel',
    },
  );
  assert.equal(second.deduplicated, true);
  assert.equal(second.retryable, true);
});

test('TA-P4-007 federation auth token is enforced when configured', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    authToken: 'secret-token',
  });

  assert.throws(
    () =>
      service.receiveEnvelope(
        {
          envelopeId: 'fed-auth-1',
          sourceDomain: 'node-b.tel',
        },
        {
          sourceDomain: 'node-b.tel',
        },
      ),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.UNAUTHORIZED);
      return true;
    },
  );
});

test('TA-P4-007 federation rate limit rejects burst traffic', () => {
  const clock = createClock();
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    envelopeRateLimitPerMinute: 1,
    clock,
  });

  service.receiveEnvelope(
    {
      envelopeId: 'fed-rate-1',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
    },
  );

  assert.throws(
    () =>
      service.receiveEnvelope(
        {
          envelopeId: 'fed-rate-2',
          sourceDomain: 'node-b.tel',
        },
        {
          sourceDomain: 'node-b.tel',
        },
      ),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.TOO_MANY_REQUESTS);
      return true;
    },
  );

  clock.tick(60_000);
  const retry = service.receiveEnvelope(
    {
      envelopeId: 'fed-rate-3',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
    },
  );
  assert.equal(retry.accepted, true);
});

test('TA-P4-008 group-state sync enforces domain consistency', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
  });

  assert.throws(
    () =>
      service.syncGroupState(
        {
          groupId: `0x${'a'.repeat(64)}`,
          state: 'ACTIVE',
          groupDomain: 'node-c.tel',
        },
        {
          sourceDomain: 'node-b.tel',
        },
      ),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.FORBIDDEN);
      return true;
    },
  );
});

test('TA-P8-002 group-state sync rejects stale stateVersion and records resilience counters', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
  });

  const first = service.syncGroupState(
    {
      groupId: `0x${'b'.repeat(64)}`,
      state: 'ACTIVE',
      stateVersion: 5,
    },
    {
      sourceDomain: 'node-b.tel',
    },
  );
  assert.equal(first.stateVersion, 5);

  assert.throws(
    () =>
      service.syncGroupState(
        {
          groupId: `0x${'b'.repeat(64)}`,
          state: 'REORGED_BACK',
          stateVersion: 4,
        },
        {
          sourceDomain: 'node-b.tel',
        },
      ),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.CONFLICT);
      assert.match(error.message, /stale/i);
      return true;
    },
  );

  const info = service.nodeInfo();
  assert.equal(info.resilience.staleGroupStateSyncRejected, 1);
  assert.equal(info.resilience.splitBrainGroupStateSyncDetected, 0);
});

test('TA-P8-002 group-state sync detects split-brain on same stateVersion with different state', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
  });

  service.syncGroupState(
    {
      groupId: `0x${'c'.repeat(64)}`,
      state: 'ACTIVE',
      stateVersion: 8,
    },
    {
      sourceDomain: 'node-b.tel',
    },
  );

  assert.throws(
    () =>
      service.syncGroupState(
        {
          groupId: `0x${'c'.repeat(64)}`,
          state: 'REORGED_BACK',
          stateVersion: 8,
        },
        {
          sourceDomain: 'node-b.tel',
        },
      ),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.CONFLICT);
      assert.match(error.message, /split-brain/i);
      return true;
    },
  );

  const info = service.nodeInfo();
  assert.equal(info.resilience.staleGroupStateSyncRejected, 0);
  assert.equal(info.resilience.splitBrainGroupStateSyncDetected, 1);
});

test('TA-P9-002 federation accepts compatible protocol versions and tracks usage stats', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    protocolVersion: 'v2',
    supportedProtocolVersions: ['v1', 'v2'],
  });

  service.receiveEnvelope(
    {
      envelopeId: 'fed-p9-v1',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
      protocolVersion: 'v1',
    },
  );
  service.receiveEnvelope(
    {
      envelopeId: 'fed-p9-v2',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
      protocolVersion: 'v2',
    },
  );
  service.recordReceipt(
    {
      envelopeId: 'fed-p9-v2',
      status: 'delivered',
    },
    {
      sourceDomain: 'node-b.tel',
    },
  );

  const info = service.nodeInfo();
  assert.equal(info.protocolVersion, 'v2');
  assert.deepEqual(info.compatibility.supportedProtocolVersions, ['v1', 'v2']);
  assert.equal(info.compatibility.stats.acceptedWithProtocolHint, 2);
  assert.equal(info.compatibility.stats.acceptedWithoutProtocolHint, 1);
  assert.equal(info.compatibility.stats.unsupportedProtocolRejected, 0);
  assert.equal(info.compatibility.stats.usageByVersion.v1, 1);
  assert.equal(info.compatibility.stats.usageByVersion.v2, 2);
});

test('TA-P9-002 federation rejects unsupported protocol versions', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    protocolVersion: 'v2',
    supportedProtocolVersions: ['v1', 'v2'],
  });

  assert.throws(
    () =>
      service.receiveEnvelope(
        {
          envelopeId: 'fed-p9-v3',
          sourceDomain: 'node-b.tel',
        },
        {
          sourceDomain: 'node-b.tel',
          protocolVersion: 'v3',
        },
      ),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.UNPROCESSABLE);
      return true;
    },
  );

  const info = service.nodeInfo();
  assert.equal(info.compatibility.stats.unsupportedProtocolRejected, 1);
});

test('TA-P11-004 federation pinning enforces sourceKeyId with current/next rotation', () => {
  const clock = createClock(1_700_000_000_000);
  const cutoverAtMs = clock.now() + 60_000;
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

  assert.throws(
    () =>
      service.receiveEnvelope(
        {
          envelopeId: 'fed-pin-missing-key',
          sourceDomain: 'node-b.tel',
        },
        {
          sourceDomain: 'node-b.tel',
        },
      ),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.UNAUTHORIZED);
      return true;
    },
  );

  const currentResult = service.receiveEnvelope(
    {
      envelopeId: 'fed-pin-current',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
      sourceKeyId: 'node-b-key-v1',
    },
  );
  assert.equal(currentResult.accepted, true);

  const nextResult = service.receiveEnvelope(
    {
      envelopeId: 'fed-pin-next',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
      sourceKeyId: 'node-b-key-v2',
    },
  );
  assert.equal(nextResult.accepted, true);

  clock.tick(60_000);
  assert.throws(
    () =>
      service.receiveEnvelope(
        {
          envelopeId: 'fed-pin-current-expired',
          sourceDomain: 'node-b.tel',
        },
        {
          sourceDomain: 'node-b.tel',
          sourceKeyId: 'node-b-key-v1',
        },
      ),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.FORBIDDEN);
      assert.match(error.message, /cutover/i);
      return true;
    },
  );
});

test('TA-P11-004 federation pinning report-only mode allows traffic but records warnings', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    pinningMode: 'report-only',
    pinningCurrentKeysByDomain: {
      'node-b.tel': ['node-b-key-v1'],
    },
  });

  const result = service.receiveEnvelope(
    {
      envelopeId: 'fed-pin-report-only',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
      sourceKeyId: 'unknown-key',
    },
  );
  assert.equal(result.accepted, true);

  const info = service.nodeInfo();
  assert.equal(info.security.pinning.mode, 'report-only');
  assert.equal(info.security.pinning.stats.reportOnlyWarnings, 1);
  assert.equal(info.security.pinning.stats.rejected, 1);
});

test('TA-P11-005 federation DLQ captures failures and replays in sequence order', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
  });

  const first = service.recordDlqFailure(
    'envelopes',
    {
      envelopeId: 'dlq-env-1',
      sourceDomain: 'node-b.tel',
      payload: 'ciphertext-1',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('upstream timeout'),
  );
  const second = service.recordDlqFailure(
    'envelopes',
    {
      envelopeId: 'dlq-env-2',
      sourceDomain: 'node-b.tel',
      payload: 'ciphertext-2',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('network reset'),
  );

  const pending = service.listDlqEntries({ status: 'PENDING' });
  assert.deepEqual(
    pending.map((entry) => entry.dlqId),
    [first.dlqId, second.dlqId],
  );

  const replay = service.replayDlq();
  assert.equal(replay.processed, 2);
  assert.equal(replay.replayed, 2);
  assert.equal(replay.failed, 0);
  assert.deepEqual(
    replay.results.map((item) => item.dlqId),
    [first.dlqId, second.dlqId],
  );
  assert.deepEqual(
    replay.results.map((item) => item.status),
    ['REPLAYED', 'REPLAYED'],
  );

  const pendingAfterReplay = service.listDlqEntries({ status: 'PENDING' });
  assert.equal(pendingAfterReplay.length, 0);
  const replayedEntries = service.listDlqEntries({ status: 'REPLAYED' });
  assert.equal(replayedEntries.length, 2);
});

test('TA-P4-008 node-info publishes domain and federation security policy', () => {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    authToken: 'secret-token',
    allowedSourceDomains: ['node-b.tel'],
    envelopeRateLimitPerMinute: 500,
    groupStateSyncRateLimitPerMinute: 250,
    receiptRateLimitPerMinute: 400,
  });

  const info = service.nodeInfo();
  assert.equal(info.domain, 'node-a.tel');
  assert.equal(info.security.authMode, 'required');
  assert.deepEqual(info.security.allowedSourceDomains, ['node-b.tel']);
  assert.equal(info.security.rateLimitPerMinute.envelopes, 500);
  assert.equal(info.security.rateLimitPerMinute['group-state-sync'], 250);
  assert.equal(info.security.rateLimitPerMinute.receipts, 400);
  assert.equal(info.security.pinning.mode, 'disabled');
  assert.equal(info.security.pinning.cutoverAt, null);
  assert.equal(info.dlq.pendingCount, 0);
  assert.equal(info.dlq.replayedCount, 0);
  assert.equal(info.compatibility.protocolVersion, 'v1');
  assert.deepEqual(info.compatibility.supportedProtocolVersions, ['v1']);
  assert.equal(info.resilience.totalGroupStateSyncConflicts, 0);
});

test('TA-P13-005 federation replay applies backoff and opens circuit on repeated failures', () => {
  const clock = createClock(50_000);
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    replayBackoffBaseMs: 1_000,
    replayBackoffMaxMs: 4_000,
    replayCircuitBreakerFailureThreshold: 2,
    replayCircuitBreakerCooldownMs: 5_000,
    clock,
  });

  service.recordDlqFailure(
    'envelopes',
    {
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('seed replay failure'),
  );

  const firstReplay = service.replayDlq();
  assert.equal(firstReplay.processed, 1);
  assert.equal(firstReplay.failed, 1);
  assert.equal(firstReplay.replayed, 0);

  const pendingAfterFirst = service.listDlqEntries({ status: 'PENDING' });
  assert.equal(pendingAfterFirst.length, 1);
  assert.equal(pendingAfterFirst[0]?.consecutiveReplayFailures, 1);
  assert.equal(pendingAfterFirst[0]?.nextReplayAtMs, clock.now() + 1_000);

  const skippedBeforeDue = service.replayDlq();
  assert.equal(skippedBeforeDue.processed, 0);

  clock.tick(1_000);
  const secondReplay = service.replayDlq();
  assert.equal(secondReplay.processed, 1);
  assert.equal(secondReplay.failed, 1);
  assert.equal(secondReplay.replayed, 0);

  const pendingAfterSecond = service.listDlqEntries({ status: 'PENDING' });
  assert.ok(pendingAfterSecond[0]?.nextReplayAtMs >= clock.now() + 5_000);

  const infoWithOpenCircuit = service.nodeInfo();
  assert.equal(infoWithOpenCircuit.resilience.replayProtection.openSourceDomainCount, 1);
  assert.equal(infoWithOpenCircuit.resilience.replayProtection.totalOpenEvents, 1);

  service.recordDlqFailure(
    'envelopes',
    {
      envelopeId: 'fed-p13-replay-ok',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('seed replay success case'),
  );

  const blockedReplay = service.replayDlq();
  assert.equal(blockedReplay.processed, 1);
  assert.equal(blockedReplay.failed, 1);
  assert.equal(blockedReplay.results[0]?.errorCode, ErrorCodes.TOO_MANY_REQUESTS);

  const infoAfterBlocked = service.nodeInfo();
  assert.equal(infoAfterBlocked.resilience.replayProtection.blockedReplayCount, 1);

  clock.tick(5_000);
  const recoveredReplay = service.replayDlq({ maxItems: 5 });
  assert.equal(recoveredReplay.replayed, 1);
  assert.equal(recoveredReplay.failed, 1);

  const infoAfterRecovery = service.nodeInfo();
  assert.equal(infoAfterRecovery.resilience.replayProtection.openSourceDomainCount, 0);
});

test('TA-P13-005 federation replay protection validates backoff range', () => {
  assert.throws(
    () =>
      new FederationService({
        selfDomain: 'node-a.tel',
        replayBackoffBaseMs: 5_000,
        replayBackoffMaxMs: 1_000,
      }),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.VALIDATION);
      return true;
    },
  );
});
