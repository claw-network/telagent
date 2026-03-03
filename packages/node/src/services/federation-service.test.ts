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
});
