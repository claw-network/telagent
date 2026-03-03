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
