import { describe, expect, it } from 'vitest';

import {
  createSessionRuntime,
  formatIsoOrDash,
  mergeMessagesByEnvelope,
  recordPullFailure,
  recordPullSuccess,
  recordSendFailure,
  recordSendSuccess,
  resetPullCursor,
} from './session-domain';

describe('session-domain', () => {
  it('mergeMessagesByEnvelope dedupes by envelope and sorts by seq', () => {
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

    expect(merged.map((item) => item.envelopeId)).toEqual(['env-1', 'env-2', 'env-3']);
    expect(merged[1].ciphertext).toBe('updated');
  });

  it('recordPullSuccess and recordPullFailure update runtime state', () => {
    const runtime = createSessionRuntime();

    recordPullFailure(runtime, 'network timeout');
    expect(runtime.pullFailures).toBe(1);
    expect(runtime.lastPullError).toBe('network timeout');

    recordPullSuccess(runtime, { cursor: '42', loadedCount: 8, action: 'pull-next-page' });
    expect(runtime.cursor).toBe('42');
    expect(runtime.lastPullCount).toBe(8);
    expect(runtime.pullFailures).toBe(0);
    expect(runtime.lastPullError).toBeNull();
    expect(runtime.lastAction).toBe('pull-next-page');

    resetPullCursor(runtime);
    expect(runtime.cursor).toBeUndefined();
  });

  it('recordSendFailure and recordSendSuccess update retry payload', () => {
    const runtime = createSessionRuntime();
    const failedPayload = { envelopeId: 'env-123', senderDid: 'did:claw:zAlice' };

    recordSendFailure(runtime, 'gateway unavailable', failedPayload);
    expect(runtime.sendFailures).toBe(1);
    expect(runtime.lastSendError).toBe('gateway unavailable');
    expect(runtime.lastFailedEnvelope).toEqual(failedPayload);

    recordSendSuccess(runtime, 'env-123');
    expect(runtime.sendFailures).toBe(0);
    expect(runtime.lastSendError).toBeNull();
    expect(runtime.lastFailedEnvelope).toBeNull();
    expect(runtime.lastSentEnvelopeId).toBe('env-123');
  });

  it('formatIsoOrDash returns dash for invalid text', () => {
    expect(formatIsoOrDash(null)).toBe('-');
    expect(formatIsoOrDash('not-a-date')).toBe('-');
    expect(formatIsoOrDash('2026-03-03T00:00:00.000Z')).toBe('2026-03-03T00:00:00.000Z');
  });
});
