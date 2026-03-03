import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApiProblemError,
  TelagentApiClient,
  assertApiV1Path,
  createEnvelopeId,
  isDidClaw,
  toCiphertextHex,
} from '../src/core/api-client.js';

test('assertApiV1Path only accepts /api/v1/*', () => {
  assert.equal(assertApiV1Path('/api/v1/messages'), '/api/v1/messages');
  assert.throws(() => assertApiV1Path('/api/v2/messages'), /\/api\/v1/);
  assert.throws(() => assertApiV1Path('/health'), /\/api\/v1/);
});

test('isDidClaw validates did:claw format', () => {
  assert.equal(isDidClaw('did:claw:zAlice'), true);
  assert.equal(isDidClaw('did:claw:alice.bob_01'), true);
  assert.equal(isDidClaw('did:key:zAlice'), false);
  assert.equal(isDidClaw('did:claw:'), false);
});

test('toCiphertextHex encodes utf8 text', () => {
  assert.equal(toCiphertextHex('Hi'), '0x4869');
  assert.equal(toCiphertextHex(''), '0x00');
});

test('createEnvelopeId builds deterministic prefix', () => {
  const value = createEnvelopeId(123456);
  assert.match(value, /^env-123456-/);
});

test('request parses RFC7807 errors to ApiProblemError', async () => {
  const client = new TelagentApiClient({
    baseUrl: 'http://localhost:9528',
    fetchImpl: async () => new Response(JSON.stringify({
      type: 'https://telagent.dev/problems/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'blocked',
      code: 'FORBIDDEN',
      instance: '/api/v1/messages',
    }), {
      status: 403,
      headers: {
        'content-type': 'application/problem+json; charset=utf-8',
      },
    }),
  });

  await assert.rejects(
    () => client.get('/api/v1/messages/pull?limit=1'),
    (error) => error instanceof ApiProblemError && error.code === 'FORBIDDEN' && error.status === 403,
  );
});

test('getData/postData extract envelope data', async () => {
  const called = [];
  const client = new TelagentApiClient({
    baseUrl: 'http://localhost:9528',
    fetchImpl: async (url, options) => {
      called.push({ url, method: options.method, body: options.body });
      return new Response(JSON.stringify({
        data: {
          ok: true,
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      });
    },
  });

  const pull = await client.pullMessages({ conversationId: 'group:demo-room', limit: 10 });
  assert.deepEqual(pull, { ok: true });

  const send = await client.sendMessage({
    envelopeId: 'env-1',
    senderDid: 'did:claw:zAlice',
    conversationId: 'group:demo-room',
    conversationType: 'group',
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-main',
    sealedHeader: '0x11',
    ciphertext: '0x4869',
    contentType: 'text',
    ttlSec: 2592000,
  });
  assert.deepEqual(send, { ok: true });
  assert.equal(called.length, 2);
  assert.equal(called[0].method, 'GET');
  assert.equal(called[1].method, 'POST');
});

test('sendMessage enforces did:claw sender', async () => {
  const client = new TelagentApiClient({
    baseUrl: 'http://localhost:9528',
    fetchImpl: async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
  });

  await assert.rejects(
    () => client.sendMessage({ senderDid: 'did:key:zAlice' }),
    /did:claw/,
  );
});
