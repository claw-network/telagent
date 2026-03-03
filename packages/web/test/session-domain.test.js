import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSessionRuntime,
  ensureSessionRuntime,
  formatIsoOrDash,
  mergeMessagesByEnvelope,
  recordPullFailure,
  recordPullSuccess,
  recordSendFailure,
  recordSendSuccess,
  resetPullCursor,
} from '../src/core/session-domain.js';

test('ensureSessionRuntime creates and reuses runtime by conversation', () => {
  const map = new Map();
  const first = ensureSessionRuntime(map, 'group:demo');
  const second = ensureSessionRuntime(map, 'group:demo');

  assert.equal(map.size, 1);
  assert.equal(first, second);
  assert.equal(first.pullFailures, 0);
  assert.equal(first.sendFailures, 0);
});

test('mergeMessagesByEnvelope dedupes by envelope and sorts by seq', () => {
  const merged = mergeMessagesByEnvelope(
    [
      { envelopeId: 'env-2', seq: 2, sentAtMs: 2000 },
      { envelopeId: 'env-1', seq: 1, sentAtMs: 1000 },
    ],
    [
      { envelopeId: 'env-2', seq: 2, sentAtMs: 2001, ciphertext: 'updated' },
      { envelopeId: 'env-3', seq: 3, sentAtMs: 3000 },
    ],
  );

  assert.deepEqual(
    merged.map((item) => item.envelopeId),
    ['env-1', 'env-2', 'env-3'],
  );
  assert.equal(merged[1].ciphertext, 'updated');
});

test('recordPullSuccess and recordPullFailure update runtime state', () => {
  const runtime = createSessionRuntime();

  recordPullFailure(runtime, 'network timeout');
  assert.equal(runtime.pullFailures, 1);
  assert.equal(runtime.lastPullError, 'network timeout');

  recordPullSuccess(runtime, {
    cursor: '42',
    loadedCount: 8,
    action: 'pull-next-page',
  });

  assert.equal(runtime.cursor, '42');
  assert.equal(runtime.lastPullCount, 8);
  assert.equal(runtime.pullFailures, 0);
  assert.equal(runtime.lastPullError, null);
  assert.equal(runtime.lastAction, 'pull-next-page');

  resetPullCursor(runtime);
  assert.equal(runtime.cursor, undefined);
  assert.equal(runtime.lastAction, 'pull:reset-cursor');
});

test('recordSendFailure and recordSendSuccess update retry payload', () => {
  const runtime = createSessionRuntime();
  const failedPayload = {
    envelopeId: 'env-123',
    senderDid: 'did:claw:zAlice',
  };

  recordSendFailure(runtime, 'gateway unavailable', failedPayload);
  assert.equal(runtime.sendFailures, 1);
  assert.equal(runtime.lastSendError, 'gateway unavailable');
  assert.deepEqual(runtime.lastFailedEnvelope, failedPayload);

  recordSendSuccess(runtime, 'env-123');
  assert.equal(runtime.sendFailures, 0);
  assert.equal(runtime.lastSendError, null);
  assert.equal(runtime.lastFailedEnvelope, null);
  assert.equal(runtime.lastSentEnvelopeId, 'env-123');
});

test('formatIsoOrDash returns dash for invalid text', () => {
  assert.equal(formatIsoOrDash(null), '-');
  assert.equal(formatIsoOrDash('not-a-date'), '-');
  assert.match(formatIsoOrDash('2026-03-03T00:00:00.000Z'), /^2026-03-03T00:00:00.000Z$/);
});
