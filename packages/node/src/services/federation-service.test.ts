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
  assert.equal(info.compatibility.protocolVersion, 'v1');
  assert.deepEqual(info.compatibility.supportedProtocolVersions, ['v1']);
  assert.equal(info.resilience.totalGroupStateSyncConflicts, 0);
});
