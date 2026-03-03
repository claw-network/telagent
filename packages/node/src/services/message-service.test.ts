import assert from 'node:assert/strict';
import test from 'node:test';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { MessageService } from './message-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

function createClock(startMs = 1_000_000): MutableClock {
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

function createMessageService(startMs?: number) {
  const clock = createClock(startMs);
  const groups = {} as ConstructorParameters<typeof MessageService>[0];
  const service = new MessageService(groups, { clock });
  return { service, clock };
}

function createDirectInput(overrides: Partial<Parameters<MessageService['send']>[0]> = {}) {
  return {
    envelopeId: 'env-base',
    senderDid: 'did:claw:zAlice',
    conversationId: 'direct:alice-bob',
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

test('TA-P4-002 sequence allocator keeps per-conversation monotonic order', () => {
  const { service } = createMessageService();

  const first = service.send(createDirectInput({ envelopeId: 'env-a1', conversationId: 'direct:a' }));
  const second = service.send(createDirectInput({ envelopeId: 'env-a2', conversationId: 'direct:a' }));
  const third = service.send(createDirectInput({ envelopeId: 'env-b1', conversationId: 'direct:b' }));

  assert.equal(first.seq, 1n);
  assert.equal(second.seq, 2n);
  assert.equal(third.seq, 1n);
});

test('TA-P4-003 dedupe keeps idempotent writes for same envelopeId', () => {
  const { service } = createMessageService();
  const input = createDirectInput({ envelopeId: 'env-dedupe-1', conversationId: 'direct:a' });

  const first = service.send(input);
  const second = service.send({ ...input });

  assert.equal(first.envelopeId, 'env-dedupe-1');
  assert.equal(second.envelopeId, first.envelopeId);
  assert.equal(second.seq, first.seq);

  const pulled = service.pull({ conversationId: 'direct:a', limit: 20 });
  assert.equal(pulled.items.length, 1);
});

test('TA-P4-003 duplicate envelopeId with different payload is rejected', () => {
  const { service } = createMessageService();
  const input = createDirectInput({ envelopeId: 'env-dedupe-2', conversationId: 'direct:a' });
  service.send(input);

  assert.throws(
    () =>
      service.send({
        ...input,
        ciphertext: '0x33',
      }),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.CONFLICT);
      return true;
    },
  );
});

test('TA-P4-004 cleanupExpired removes expired envelopes and releases dedupe key', () => {
  const { service, clock } = createMessageService(1_000);

  const expiredInput = createDirectInput({
    envelopeId: 'env-expired',
    conversationId: 'direct:ttl',
    ttlSec: 1,
  });
  const longLivedInput = createDirectInput({
    envelopeId: 'env-active',
    conversationId: 'direct:ttl',
    ttlSec: 100,
  });

  const first = service.send(expiredInput);
  assert.equal(first.seq, 1n);
  clock.tick(400);
  service.send(longLivedInput);

  clock.tick(1_100);
  const report = service.cleanupExpired();
  assert.equal(report.removed, 1);
  assert.equal(report.remaining, 1);

  const pulled = service.pull({ conversationId: 'direct:ttl', limit: 20 });
  assert.equal(pulled.items.length, 1);
  assert.equal(pulled.items[0].envelopeId, 'env-active');

  const resent = service.send({
    ...expiredInput,
    ttlSec: 20,
    ciphertext: '0x44',
  });
  assert.equal(resent.envelopeId, 'env-expired');
  assert.equal(resent.seq, 3n);
});
