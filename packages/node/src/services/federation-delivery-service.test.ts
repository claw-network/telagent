import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Envelope } from '@telagent/protocol';

import { MessageRepository } from '../storage/message-repository.js';
import { FederationDeliveryService } from './federation-delivery-service.js';

interface MutableClock {
  now(): number;
  set(nextMs: number): void;
}

function createClock(startMs = 1_000): MutableClock {
  let current = startMs;
  return {
    now() {
      return current;
    },
    set(nextMs: number) {
      current = nextMs;
    },
  };
}

function buildEnvelope(overrides: Partial<Envelope> = {}): Envelope {
  return {
    envelopeId: 'env-fed-outbox-1',
    conversationId: 'direct:did:claw:zAlice--did:claw:zBob',
    conversationType: 'direct',
    routeHint: {
      targetDomain: 'node-b.tel',
      mailboxKeyId: 'mailbox-1',
    },
    sealedHeader: '0x11',
    seq: 1n,
    ciphertext: '0x22',
    contentType: 'text',
    sentAtMs: 1_000,
    ttlSec: 3_600,
    provisional: false,
    ...overrides,
  };
}

test('TA-P17-001 persistent outbox survives restart and flushes pending envelope', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telagent-fed-outbox-'));
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const dbPath = path.join(tmpDir, 'mailbox.sqlite');
  const repository = new MessageRepository(dbPath);
  t.after(async () => {
    await repository.close();
  });

  let deliveredRequests = 0;
  const fetchImpl: typeof fetch = async () => {
    deliveredRequests += 1;
    return new Response(JSON.stringify({ data: { accepted: true } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };

  const producer = new FederationDeliveryService({
    selfDomain: 'node-a.tel',
    store: repository,
    fetchImpl,
  });

  const queued = await producer.enqueue(buildEnvelope());
  assert.equal(queued, true);
  assert.equal(await repository.countFederationOutbox?.(), 1);

  const consumer = new FederationDeliveryService({
    selfDomain: 'node-a.tel',
    store: repository,
    fetchImpl,
  });

  await consumer.flushOnce();

  assert.equal(deliveredRequests, 1);
  assert.equal(await repository.countFederationOutbox?.(), 0);
});

test('TA-P17-002 persistent outbox records retries and eventually clears on success', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telagent-fed-retry-'));
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const dbPath = path.join(tmpDir, 'mailbox.sqlite');
  const repository = new MessageRepository(dbPath);
  t.after(async () => {
    await repository.close();
  });

  const clock = createClock(5_000);
  let requestCount = 0;
  const fetchImpl: typeof fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response('temporary unavailable', { status: 503 });
    }
    return new Response(JSON.stringify({ data: { accepted: true } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };

  const service = new FederationDeliveryService({
    selfDomain: 'node-a.tel',
    store: repository,
    fetchImpl,
    clock,
    retryBaseMs: 1_000,
    retryMaxMs: 5_000,
  });

  await service.enqueue(buildEnvelope({ envelopeId: 'env-fed-outbox-retry-1' }));
  await service.flushOnce();

  const pendingAfterFailure = await repository.listDueFederationOutbox?.({
    nowMs: Number.MAX_SAFE_INTEGER,
    limit: 10,
  });
  assert.ok(pendingAfterFailure);
  assert.equal(pendingAfterFailure.length, 1);
  assert.equal(pendingAfterFailure[0].attemptCount, 1);
  assert.match(pendingAfterFailure[0].lastError ?? '', /503/);

  clock.set(pendingAfterFailure[0].nextRetryAtMs + 1);
  await service.flushOnce();

  assert.equal(requestCount, 2);
  assert.equal(await repository.countFederationOutbox?.(), 0);
});
