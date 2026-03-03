import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiServer } from './api/server.js';
import type { RuntimeContext } from './api/types.js';

class FakeIdentityService {
  async getSelf() {
    return {
      did: 'did:claw:zSelf',
      didHash: '0x' + '1'.repeat(64),
      controller: '0x' + '1'.repeat(40),
      publicKey: '0x11',
      isActive: true,
      resolvedAtMs: Date.now(),
    };
  }

  async resolve(did: string) {
    return {
      did,
      didHash: '0x' + '2'.repeat(64),
      controller: '0x' + '2'.repeat(40),
      publicKey: '0x22',
      isActive: true,
      resolvedAtMs: Date.now(),
    };
  }
}

class FakeGroupService {
  async createGroup(_input: unknown) {
    return {
      txHash: '0x' + 'a'.repeat(64),
      group: {
        groupId: '0x' + 'b'.repeat(64),
        creatorDid: 'did:claw:zSelf',
        creatorDidHash: '0x' + '1'.repeat(64),
        groupDomain: 'alpha.tel',
        domainProofHash: '0x' + '3'.repeat(64),
        initialMlsStateHash: '0x' + '4'.repeat(64),
        state: 'ACTIVE',
        createdAtMs: Date.now(),
        txHash: '0x' + 'a'.repeat(64),
        blockNumber: 100,
      },
    };
  }

  async inviteMember() {
    return { txHash: '0x' + 'c'.repeat(64) };
  }

  async acceptInvite() {
    return { txHash: '0x' + 'd'.repeat(64) };
  }

  async removeMember() {
    return { txHash: '0x' + 'e'.repeat(64) };
  }

  getGroup(groupId: string) {
    return {
      groupId,
      creatorDid: 'did:claw:zSelf',
      creatorDidHash: '0x' + '1'.repeat(64),
      groupDomain: 'alpha.tel',
      domainProofHash: '0x' + '3'.repeat(64),
      initialMlsStateHash: '0x' + '4'.repeat(64),
      state: 'ACTIVE',
      createdAtMs: Date.now(),
      txHash: '0x' + '5'.repeat(64),
      blockNumber: 100,
    };
  }

  listMembers() {
    return [
      {
        groupId: '0x' + 'b'.repeat(64),
        did: 'did:claw:zM1',
        didHash: '0x' + '6'.repeat(64),
        state: 'FINALIZED',
        joinedAtMs: Date.now(),
      },
      {
        groupId: '0x' + 'b'.repeat(64),
        did: 'did:claw:zM2',
        didHash: '0x' + '7'.repeat(64),
        state: 'PENDING',
        joinedAtMs: Date.now(),
      },
    ];
  }

  getChainState(groupId: string) {
    return {
      groupId,
      state: 'ACTIVE',
      finalizedTxHash: '0x' + '5'.repeat(64),
      blockNumber: 100,
      updatedAtMs: Date.now(),
    };
  }
}

class FakeGasService {
  async getNativeGasBalance() {
    return 1_000_000n;
  }

  async getTokenBalance() {
    return 900_000n;
  }
}

class FakeMessageService {
  send() {
    return {
      envelopeId: 'env-1',
      conversationId: 'group:0x' + 'b'.repeat(64),
      conversationType: 'group',
      routeHint: {
        targetDomain: 'alpha.tel',
        mailboxKeyId: 'mailbox-1',
      },
      sealedHeader: '0x11',
      seq: 1n,
      ciphertext: '0x22',
      contentType: 'text',
      sentAtMs: Date.now(),
      ttlSec: 3600,
      provisional: false,
    };
  }

  pull() {
    return {
      items: [],
      nextCursor: null,
    };
  }
}

class FakeAttachmentService {
  initUpload() {
    return {
      objectKey: 'attachments/o1',
      uploadUrl: 'https://uploads.telagent.local/attachments%2Fo1',
      expiresInSec: 900,
    };
  }

  completeUpload() {
    return {
      objectKey: 'attachments/o1',
      manifestHash: '0x' + '8'.repeat(64),
      checksum: '0x' + '9'.repeat(64),
      completedAtMs: Date.now(),
    };
  }
}

class FakeFederationService {
  receiveEnvelope(_payload: Record<string, unknown>, _meta: { sourceDomain: string; authToken?: string }) {
    return { accepted: true, id: 'fed-1', deduplicated: false, retryable: true };
  }

  syncGroupState(
    _payload: { groupId: string; state: string; groupDomain?: string },
    _meta: { sourceDomain: string; authToken?: string },
  ) {
    return { synced: true, updatedAtMs: Date.now(), deduplicated: false };
  }

  recordReceipt(
    _payload: { envelopeId: string; status: 'delivered' | 'read' },
    _meta: { sourceDomain: string; authToken?: string },
  ) {
    return { accepted: true, deduplicated: false, retryable: true };
  }

  nodeInfo() {
    return {
      protocolVersion: 'v1',
      domain: 'node-a.tel',
      capabilities: ['identity', 'groups', 'messages', 'attachments', 'federation'],
      envelopeCount: 0,
      receiptCount: 0,
      groupStateSyncCount: 0,
      security: {
        authMode: 'none',
        allowedSourceDomains: [],
        rateLimitPerMinute: {
          envelopes: 600,
          'group-state-sync': 300,
          receipts: 600,
        },
      },
    };
  }
}

async function startTestServer() {
  const context: RuntimeContext = {
    config: { host: '127.0.0.1', port: 0 },
    identityService: new FakeIdentityService() as unknown as RuntimeContext['identityService'],
    groupService: new FakeGroupService() as unknown as RuntimeContext['groupService'],
    gasService: new FakeGasService() as unknown as RuntimeContext['gasService'],
    messageService: new FakeMessageService() as unknown as RuntimeContext['messageService'],
    attachmentService: new FakeAttachmentService() as unknown as RuntimeContext['attachmentService'],
    federationService: new FakeFederationService() as unknown as RuntimeContext['federationService'],
  };

  const server = new ApiServer(context);
  await server.start();

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

test('created response returns data envelope and Location header', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const response = await fetch(`${baseUrl}/api/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      senderDid: 'did:claw:zSelf',
      conversationId: 'group:0x' + 'b'.repeat(64),
      conversationType: 'group',
      targetDomain: 'alpha.tel',
      mailboxKeyId: 'mailbox-1',
      sealedHeader: '0x11',
      ciphertext: '0x22',
      contentType: 'text',
      ttlSec: 3600,
    }),
  });

  assert.equal(response.status, 201);
  assert.match(response.headers.get('location') ?? '', /^\/api\/v1\/messages\/pull\?/);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);

  const body = (await response.json()) as {
    data: { envelope: { envelopeId: string; seq: string } };
    links: { self: string };
  };
  assert.equal(body.data.envelope.envelopeId, 'env-1');
  assert.equal(body.data.envelope.seq, '1');
  assert.match(body.links.self, /^\/api\/v1\/messages\/pull\?/);
});

test('list response returns paginated envelope shape', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const groupId = `0x${'b'.repeat(64)}`;
  const response = await fetch(`${baseUrl}/api/v1/groups/${groupId}/members?view=all&page=1&per_page=1`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    data: Array<{ did: string }>;
    meta: { pagination: { page: number; perPage: number; total: number; totalPages: number } };
    links: { self: string; first: string; last: string; prev: string | null; next: string | null };
  };

  assert.equal(body.data.length, 1);
  assert.equal(body.meta.pagination.page, 1);
  assert.equal(body.meta.pagination.perPage, 1);
  assert.equal(body.meta.pagination.total, 2);
  assert.equal(body.meta.pagination.totalPages, 2);
  assert.match(body.links.self, /\/api\/v1\/groups\/.*\/members\?/);
});

test('validation errors use RFC7807 shape and problem+json content type', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const response = await fetch(`${baseUrl}/api/v1/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json/);

  const body = (await response.json()) as {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    code: string;
  };

  assert.equal(body.status, 400);
  assert.equal(body.title, 'Bad Request');
  assert.equal(body.instance, '/api/v1/groups');
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.match(body.type, /^https:\/\/telagent\.dev\/errors\/validation-error$/);
  assert.ok(body.detail.length > 0);
});

test('not found uses RFC7807 shape', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const response = await fetch(`${baseUrl}/api/v1/not-exist`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json/);

  const body = (await response.json()) as {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    code: string;
  };

  assert.equal(body.title, 'Not Found');
  assert.equal(body.status, 404);
  assert.equal(body.instance, '/api/v1/not-exist');
  assert.equal(body.code, 'NOT_FOUND');
  assert.match(body.type, /^https:\/\/telagent\.dev\/errors\/not-found$/);
});

test('identities and groups endpoints are accessible with expected status codes', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const groupId = `0x${'b'.repeat(64)}`;
  const inviteId = `0x${'c'.repeat(64)}`;
  const did = 'did:claw:zM2';

  const selfRes = await fetch(`${baseUrl}/api/v1/identities/self`);
  assert.equal(selfRes.status, 200);

  const resolveRes = await fetch(`${baseUrl}/api/v1/identities/${encodeURIComponent(did)}`);
  assert.equal(resolveRes.status, 200);

  const createGroupRes = await fetch(`${baseUrl}/api/v1/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      creatorDid: 'did:claw:zSelf',
      groupId,
      groupDomain: 'alpha.tel',
      domainProofHash: `0x${'3'.repeat(64)}`,
      initialMlsStateHash: `0x${'4'.repeat(64)}`,
    }),
  });
  assert.equal(createGroupRes.status, 201);

  const getGroupRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}`);
  assert.equal(getGroupRes.status, 200);

  const membersRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/members?view=all&page=1&per_page=20`);
  assert.equal(membersRes.status, 200);

  const inviteRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inviterDid: 'did:claw:zSelf',
      inviteeDid: did,
      inviteId,
      mlsCommitHash: `0x${'5'.repeat(64)}`,
    }),
  });
  assert.equal(inviteRes.status, 201);

  const acceptRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/invites/${inviteId}/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inviteeDid: did,
      mlsWelcomeHash: `0x${'6'.repeat(64)}`,
    }),
  });
  assert.equal(acceptRes.status, 201);

  const removeRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/members/${encodeURIComponent(did)}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operatorDid: 'did:claw:zSelf',
      mlsCommitHash: `0x${'7'.repeat(64)}`,
    }),
  });
  assert.equal(removeRes.status, 204);

  const chainStateRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/chain-state`);
  assert.equal(chainStateRes.status, 200);
});

test('messages, attachments and federation endpoints are accessible', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const pullRes = await fetch(`${baseUrl}/api/v1/messages/pull?limit=20`);
  assert.equal(pullRes.status, 200);

  const initUploadRes = await fetch(`${baseUrl}/api/v1/attachments/init-upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: 'a.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      manifestHash: `0x${'8'.repeat(64)}`,
    }),
  });
  assert.equal(initUploadRes.status, 201);

  const completeUploadRes = await fetch(`${baseUrl}/api/v1/attachments/complete-upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      objectKey: 'attachments/o1',
      manifestHash: `0x${'8'.repeat(64)}`,
      checksum: `0x${'9'.repeat(64)}`,
    }),
  });
  assert.equal(completeUploadRes.status, 200);

  const fedEnvelopeRes = await fetch(`${baseUrl}/api/v1/federation/envelopes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelopeId: 'fed-1', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(fedEnvelopeRes.status, 201);

  const fedSyncRes = await fetch(`${baseUrl}/api/v1/federation/group-state/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ groupId: `0x${'b'.repeat(64)}`, state: 'ACTIVE', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(fedSyncRes.status, 201);

  const fedReceiptRes = await fetch(`${baseUrl}/api/v1/federation/receipts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelopeId: 'fed-1', status: 'delivered', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(fedReceiptRes.status, 201);

  const nodeInfoRes = await fetch(`${baseUrl}/api/v1/federation/node-info`);
  assert.equal(nodeInfoRes.status, 200);
});
