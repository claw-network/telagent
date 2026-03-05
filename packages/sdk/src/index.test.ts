import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';

import { TelagentSdk, TelagentSdkError } from './index.js';

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function writeProblem(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/problem+json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      writeProblem(res, 500, {
        type: 'https://telagent.dev/errors/internal-error',
        title: 'Internal Server Error',
        status: 500,
        detail: error instanceof Error ? error.message : String(error),
        instance: req.url ?? '/',
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to start test server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

test('TA-P11-008 SDK quickstart covers create-group and send/pull message flow', async (t) => {
  const { baseUrl, close } = await startServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/api/v1/groups') {
      const body = (await readJson(req)) as { groupId: string; creatorDid: string };
      writeJson(res, 201, {
        data: {
          txHash: '0xgroup',
          group: {
            groupId: body.groupId,
            creatorDid: body.creatorDid,
            creatorDidHash: `0x${'a'.repeat(64)}`,
            groupDomain: 'alpha.tel',
            domainProofHash: `0x${'b'.repeat(64)}`,
            initialMlsStateHash: `0x${'c'.repeat(64)}`,
            state: 'PENDING_ONCHAIN',
            createdAtMs: 1_000,
          },
        },
        links: {
          self: `/api/v1/groups/${body.groupId}`,
        },
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/messages') {
      writeJson(res, 201, {
        data: {
          envelope: {
            envelopeId: 'env-1',
            conversationId: 'direct:alice-bob',
            conversationType: 'direct',
            routeHint: {
              targetDomain: 'alpha.tel',
              mailboxKeyId: 'mailbox-1',
            },
            sealedHeader: '0x11',
            seq: '1',
            ciphertext: '0x22',
            contentType: 'text',
            sentAtMs: 2_000,
            ttlSec: 60,
            provisional: false,
          },
        },
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/messages/pull') {
      writeJson(res, 200, {
        data: {
          items: [
            {
              envelopeId: 'env-1',
              conversationId: 'direct:alice-bob',
              conversationType: 'direct',
              routeHint: {
                targetDomain: 'alpha.tel',
                mailboxKeyId: 'mailbox-1',
              },
              sealedHeader: '0x11',
              seq: '1',
              ciphertext: '0x22',
              contentType: 'text',
              sentAtMs: 2_000,
              ttlSec: 60,
              provisional: false,
            },
          ],
          cursor: null,
        },
      });
      return;
    }

    writeProblem(res, 404, {
      type: 'https://telagent.dev/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'not found',
      instance: url.pathname,
      code: 'NOT_FOUND',
    });
  });
  t.after(close);

  const sdk = new TelagentSdk({ baseUrl });
  const group = await sdk.createGroup({
    creatorDid: 'did:claw:zAlice',
    groupId: `0x${'1'.repeat(64)}`,
    groupDomain: 'alpha.tel',
    domainProofHash: `0x${'2'.repeat(64)}`,
    initialMlsStateHash: `0x${'3'.repeat(64)}`,
  });
  assert.equal(group.group.groupId, `0x${'1'.repeat(64)}`);

  const envelope = await sdk.sendMessage({
    envelopeId: 'env-1',
    senderDid: 'did:claw:zAlice',
    conversationId: 'direct:alice-bob',
    conversationType: 'direct',
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-1',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text',
    ttlSec: 60,
  });
  assert.equal(envelope.seq, 1n);

  const mailbox = await sdk.pullMessages({
    conversationId: 'direct:alice-bob',
    limit: 20,
  });
  assert.equal(mailbox.items.length, 1);
  assert.equal(mailbox.items[0].seq, 1n);
});

test('SDK supports owner permissions and conversation listing envelopes', async (t) => {
  let privateEnabled = false;

  const { baseUrl, close } = await startServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/api/v1/owner/permissions') {
      writeJson(res, 200, {
        data: {
          mode: 'intervener',
          interventionScopes: ['send_message', 'manage_groups'],
          privateConversations: privateEnabled ? ['direct:did:claw:zAlice:did:claw:zBob'] : [],
        },
        links: {
          self: '/api/v1/owner/permissions',
        },
      });
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/api/v1/conversations/direct%3Adid%3Aclaw%3AzAlice%3Adid%3Aclaw%3AzBob/privacy') {
      const body = (await readJson(req)) as { private?: boolean };
      privateEnabled = Boolean(body.private);
      writeJson(res, 200, {
        data: {
          conversationId: 'direct:did:claw:zAlice:did:claw:zBob',
          private: privateEnabled,
          updatedAtMs: 1_234,
        },
        links: {
          self: '/api/v1/conversations/direct%3Adid%3Aclaw%3AzAlice%3Adid%3Aclaw%3AzBob/privacy',
        },
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/conversations') {
      writeJson(res, 200, {
        data: [
          {
            conversationId: 'direct:did:claw:zAlice:did:claw:zBob',
            conversationType: 'direct',
            peerDid: 'did:claw:zBob',
            displayName: 'did:claw:zBob',
            lastMessagePreview: privateEnabled ? null : 'hello',
            lastMessageAtMs: 1_000,
            unreadCount: 0,
            private: privateEnabled,
            avatarUrl: null,
          },
        ],
        meta: {
          pagination: {
            page: 1,
            perPage: 20,
            total: 1,
            totalPages: 1,
          },
        },
        links: {
          self: '/api/v1/conversations?page=1&per_page=20',
          first: '/api/v1/conversations?page=1&per_page=20',
          last: '/api/v1/conversations?page=1&per_page=20',
          prev: null,
          next: null,
        },
      });
      return;
    }

    writeProblem(res, 404, {
      type: 'https://telagent.dev/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'not found',
      instance: url.pathname,
      code: 'NOT_FOUND',
    });
  });
  t.after(close);

  const sdk = new TelagentSdk({ baseUrl });
  const conversations = await sdk.listConversations({ page: 1, perPage: 20 });
  assert.equal(conversations.data.length, 1);
  assert.equal(conversations.data[0].conversationId, 'direct:did:claw:zAlice:did:claw:zBob');
  assert.equal(conversations.data[0].private, false);
  assert.equal(conversations.data[0].lastMessagePreview, 'hello');
  assert.equal(conversations.meta.pagination.total, 1);

  const privacy = await sdk.setConversationPrivacy('direct:did:claw:zAlice:did:claw:zBob', true);
  assert.equal(privacy.private, true);
  assert.equal(privacy.updatedAtMs, 1_234);

  const permissions = await sdk.getOwnerPermissions();
  assert.equal(permissions.mode, 'intervener');
  assert.deepEqual(permissions.privateConversations, ['direct:did:claw:zAlice:did:claw:zBob']);

  const conversationsAfterPrivacy = await sdk.listConversations({ page: 1, perPage: 20 });
  assert.equal(conversationsAfterPrivacy.data[0].private, true);
  assert.equal(conversationsAfterPrivacy.data[0].lastMessagePreview, null);
});

test('SDK wraps session and clawnet routes with proper auth headers', async (t) => {
  const seenAuthByPath = new Map<string, string | undefined>();

  const { baseUrl, close } = await startServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const key = `${req.method ?? 'GET'} ${url.pathname}`;
    const auth = req.headers.authorization as string | undefined;
    seenAuthByPath.set(key, auth);

    if (req.method === 'POST' && url.pathname === '/api/v1/session/unlock') {
      writeJson(res, 200, {
        data: {
          sessionToken: 'tses_unlock',
          expiresAt: '2026-03-05T00:00:00.000Z',
          scope: ['transfer', 'market'],
          did: 'did:claw:zAlice',
        },
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/session') {
      writeJson(res, 200, {
        data: {
          active: true,
          expiresAt: '2026-03-05T00:00:00.000Z',
          scope: ['transfer'],
          operationsUsed: 1,
          createdAt: '2026-03-04T00:00:00.000Z',
        },
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/session/lock') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/clawnet/wallet/history') {
      writeJson(res, 200, { data: [{ txHash: '0x1' }] });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/v1/clawnet/wallet/history/')) {
      writeJson(res, 200, { data: [{ txHash: '0x2' }] });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/clawnet/market/tasks') {
      writeJson(res, 200, { data: [{ id: 'task-1' }] });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/clawnet/markets/search') {
      writeJson(res, 200, { data: [{ id: 'search-1' }] });
      return;
    }

    if (req.method === 'GET' && url.pathname.endsWith('/bids')) {
      writeJson(res, 200, { data: [{ id: 'bid-1' }] });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/v1/clawnet/')) {
      writeJson(res, 200, { data: { ok: true, path: url.pathname, query: Object.fromEntries(url.searchParams.entries()) } });
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/v1/clawnet/')) {
      const body = await readJson(req);
      writeJson(res, 200, { data: { ok: true, path: url.pathname, body } });
      return;
    }

    writeProblem(res, 404, {
      type: 'https://telagent.dev/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'not found',
      instance: url.pathname,
      code: 'NOT_FOUND',
    });
  });
  t.after(close);

  const sdk = new TelagentSdk({
    baseUrl,
    accessToken: 'owner_access_token',
  });

  const unlocked = await sdk.unlockSession({
    passphrase: 'secret',
    ttlSeconds: 120,
    scope: ['transfer', 'market'],
    maxOperations: 20,
  });
  assert.equal(unlocked.sessionToken, 'tses_unlock');

  const sessionInfo = await sdk.getSessionInfo('tses_unlock');
  assert.equal(sessionInfo.active, true);
  await sdk.lockSession('tses_unlock');

  await sdk.getWalletBalance();
  await sdk.getWalletBalance('did:claw:zBob');
  await sdk.getWalletNonce();
  await sdk.getWalletNonce('did:claw:zBob');
  const ownHistory = await sdk.getWalletHistory({ limit: 10, offset: 5 });
  assert.equal(ownHistory.length, 1);
  const didHistory = await sdk.getWalletHistory({ did: 'did:claw:zBob', limit: 1 });
  assert.equal(didHistory.length, 1);
  await sdk.getClawnetSelfIdentity();
  await sdk.getClawnetIdentity('did:claw:zBob');
  await sdk.getAgentProfile('did:claw:zBob');
  await sdk.getReputation('did:claw:zBob');
  await sdk.getClawnetHealth();
  await sdk.getEscrow('escrow-1');
  const tasks = await sdk.listTasks({ status: 'open' });
  assert.equal(tasks.length, 1);
  const searchResults = await sdk.searchMarkets({ q: 'design' });
  assert.equal(searchResults.length, 1);
  const bids = await sdk.listTaskBids('task-1');
  assert.equal(bids.length, 1);

  await sdk.transfer('tses_unlock', {
    to: 'did:claw:zBob',
    amount: 10,
    memo: 'hello',
  });
  await sdk.createEscrow('tses_unlock', {
    beneficiary: 'did:claw:zBob',
    amount: 20,
  });
  await sdk.releaseEscrow('tses_unlock', 'escrow-1');
  await sdk.publishTask('tses_unlock', {
    title: 'Task',
    description: 'Desc',
    budget: 99,
    tags: ['a'],
  });
  await sdk.bid('tses_unlock', 'task-1', {
    amount: 12,
    proposal: 'proposal',
  });
  await sdk.acceptBid('tses_unlock', 'task-1', 'bid-1');
  await sdk.submitReview('tses_unlock', {
    targetDid: 'did:claw:zBob',
    score: 5,
    comment: 'great',
    orderId: 'ord-1',
  });
  await sdk.createServiceContract('tses_unlock', {
    title: 'Contract',
  });

  assert.equal(seenAuthByPath.get('POST /api/v1/session/unlock'), 'Bearer owner_access_token');
  assert.equal(seenAuthByPath.get('GET /api/v1/session'), 'Bearer tses_unlock');
  assert.equal(seenAuthByPath.get('POST /api/v1/session/lock'), 'Bearer tses_unlock');
  assert.equal(seenAuthByPath.get('GET /api/v1/clawnet/wallet/balance'), 'Bearer owner_access_token');
  assert.equal(seenAuthByPath.get('POST /api/v1/clawnet/wallet/transfer'), 'Bearer tses_unlock');
  assert.equal(seenAuthByPath.get('POST /api/v1/clawnet/contracts'), 'Bearer tses_unlock');
});

test('TA-P11-008 SDK maps RFC7807 errors to TelagentSdkError', async (t) => {
  const { baseUrl, close } = await startServer((_req, res) => {
    writeProblem(res, 422, {
      type: 'https://telagent.dev/errors/unprocessable-entity',
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'DID is revoked or inactive',
      instance: '/api/v1/messages',
      code: 'UNPROCESSABLE_ENTITY',
    });
  });
  t.after(close);

  const sdk = new TelagentSdk({ baseUrl });
  await assert.rejects(
    async () =>
      sdk.sendMessage({
        senderDid: 'did:claw:zAlice',
        conversationId: 'direct:alice-bob',
        conversationType: 'direct',
        targetDomain: 'alpha.tel',
        mailboxKeyId: 'mailbox-1',
        sealedHeader: '0x11',
        ciphertext: '0x22',
        contentType: 'text',
        ttlSec: 60,
      }),
    (error) => {
      assert.ok(error instanceof TelagentSdkError);
      assert.equal(error.status, 422);
      assert.equal(error.problem.code, 'UNPROCESSABLE_ENTITY');
      return true;
    },
  );
});

test('TA-P14-005 SDK getIdentity encodes DID path segment', async (t) => {
  let observedPath = '';
  const { baseUrl, close } = await startServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    observedPath = url.pathname;
    writeJson(res, 200, {
      data: {
        did: 'did:claw:zAlice',
        didHash: `0x${'1'.repeat(64)}`,
        controller: `0x${'2'.repeat(40)}`,
        publicKey: '0x11',
        isActive: true,
        resolvedAtMs: 1_000,
      },
    });
  });
  t.after(close);

  const sdk = new TelagentSdk({ baseUrl });
  await sdk.getIdentity('did:claw:zAlice/with-slash');
  assert.equal(observedPath, '/api/v1/identities/did%3Aclaw%3AzAlice%2Fwith-slash');
});

test('TA-P14-005 SDK maps direct ACL FORBIDDEN RFC7807 to TelagentSdkError', async (t) => {
  const { baseUrl, close } = await startServer((_req, res) => {
    writeProblem(res, 403, {
      type: 'https://telagent.dev/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'senderDid is not a direct conversation participant for conversation(direct:acl-case)',
      instance: '/api/v1/messages',
      code: 'FORBIDDEN',
    });
  });
  t.after(close);

  const sdk = new TelagentSdk({ baseUrl });
  await assert.rejects(
    async () =>
      sdk.sendMessage({
        senderDid: 'did:claw:zCarol',
        conversationId: 'direct:acl-case',
        conversationType: 'direct',
        targetDomain: 'alpha.tel',
        mailboxKeyId: 'mailbox-1',
        sealedHeader: '0x11',
        ciphertext: '0x22',
        contentType: 'text',
        ttlSec: 60,
      }),
    (error) => {
      assert.ok(error instanceof TelagentSdkError);
      assert.equal(error.status, 403);
      assert.equal(error.problem.code, 'FORBIDDEN');
      assert.match(error.problem.detail ?? '', /direct conversation participant/);
      return true;
    },
  );
});
