import { describe, expect, it } from 'vitest';

import {
  ApiProblemError,
  TelagentApiClient,
  assertApiV1Path,
  createEnvelopeId,
  isDidClaw,
  toCiphertextHex,
} from './api-client';

describe('api-client', () => {
  it('assertApiV1Path only accepts /api/v1/*', () => {
    expect(assertApiV1Path('/api/v1/messages')).toBe('/api/v1/messages');
    expect(() => assertApiV1Path('/api/v2/messages')).toThrow('/api/v1');
    expect(() => assertApiV1Path('/health')).toThrow('/api/v1');
  });

  it('isDidClaw validates did:claw format', () => {
    expect(isDidClaw('did:claw:zAlice')).toBe(true);
    expect(isDidClaw('did:claw:alice.bob_01')).toBe(true);
    expect(isDidClaw('did:key:zAlice')).toBe(false);
    expect(isDidClaw('did:claw:')).toBe(false);
  });

  it('toCiphertextHex encodes utf8 text', () => {
    expect(toCiphertextHex('Hi')).toBe('0x4869');
    expect(toCiphertextHex('')).toBe('0x00');
  });

  it('createEnvelopeId builds deterministic prefix', () => {
    expect(createEnvelopeId(123456)).toMatch(/^env-123456-/);
  });

  it('request parses RFC7807 errors to ApiProblemError', async () => {
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
        headers: { 'content-type': 'application/problem+json; charset=utf-8' },
      }),
    });

    await expect(client.get('/api/v1/messages/pull?limit=1')).rejects.toSatisfy(
      (error) => error instanceof ApiProblemError && error.code === 'FORBIDDEN' && error.status === 403,
    );
  });

  it('listGroupMembersEnvelope returns data/meta links payload', async () => {
    const client = new TelagentApiClient({
      baseUrl: 'http://localhost:9528',
      fetchImpl: async () => new Response(JSON.stringify({
        data: [{ did: 'did:claw:zBob', state: 'PENDING' }],
        meta: { pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } },
        links: { self: '/api/v1/groups/0x1/members?page=1&per_page=20' },
      }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }),
    });

    const envelope = await client.listGroupMembersEnvelope('0x1', { view: 'all', page: 1, perPage: 20 });
    expect(Array.isArray(envelope.data)).toBe(true);
    expect(envelope.meta.pagination.total).toBe(1);

    const members = await client.listGroupMembers('0x1', 'all');
    expect(members).toEqual([{ did: 'did:claw:zBob', state: 'PENDING' }]);
  });
});
