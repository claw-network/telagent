import fs from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TelagentSdk } from '../src/index.js';

interface Phase11SdkCheckReport {
  phase: 'Phase 11';
  taskId: 'TA-P11-008';
  generatedAt: string;
  summary: {
    createGroupOk: boolean;
    sendMessageOk: boolean;
    pullMessageOk: boolean;
    integratesWithin30Minutes: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, currentValue) => (typeof currentValue === 'bigint' ? currentValue.toString() : currentValue),
    2,
  );
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = toJson(body);
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

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P11_SDK_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-11/manifests/2026-03-03-p11-sdk-quickstart-check.json');

  const createdAtMs = Date.now();
  const server = createServer(async (req, res) => {
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
            createdAtMs,
          },
        },
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/messages') {
      writeJson(res, 201, {
        data: {
          envelope: {
            envelopeId: 'sdk-env-1',
            conversationId: 'direct:sdk-alice-bob',
            conversationType: 'direct',
            routeHint: {
              targetDomain: 'alpha.tel',
              mailboxKeyId: 'mailbox-1',
            },
            sealedHeader: '0x11',
            seq: '1',
            ciphertext: '0x22',
            contentType: 'text',
            sentAtMs: createdAtMs,
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
              envelopeId: 'sdk-env-1',
              conversationId: 'direct:sdk-alice-bob',
              conversationType: 'direct',
              routeHint: {
                targetDomain: 'alpha.tel',
                mailboxKeyId: 'mailbox-1',
              },
              sealedHeader: '0x11',
              seq: '1',
              ciphertext: '0x22',
              contentType: 'text',
              sentAtMs: createdAtMs,
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
      detail: 'route not found',
      instance: url.pathname,
      code: 'NOT_FOUND',
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to start sdk check server');
  }

  const sdk = new TelagentSdk({
    baseUrl: `http://127.0.0.1:${address.port}`,
  });
  const startMs = Date.now();
  let createGroupOk = false;
  let sendMessageOk = false;
  let pullMessageOk = false;

  const created = await sdk.createGroup({
    creatorDid: 'did:claw:zAlice',
    groupId: `0x${'1'.repeat(64)}`,
    groupDomain: 'alpha.tel',
    domainProofHash: `0x${'2'.repeat(64)}`,
    initialMlsStateHash: `0x${'3'.repeat(64)}`,
  });
  createGroupOk = created.group.groupId === `0x${'1'.repeat(64)}`;

  const sent = await sdk.sendMessage({
    senderDid: 'did:claw:zAlice',
    conversationId: 'direct:sdk-alice-bob',
    conversationType: 'direct',
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-1',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text',
    ttlSec: 60,
  });
  sendMessageOk = sent.seq === 1n;

  const pulled = await sdk.pullMessages({
    conversationId: 'direct:sdk-alice-bob',
    limit: 10,
  });
  pullMessageOk = pulled.items.length === 1 && pulled.items[0].seq === 1n;

  const elapsedMs = Date.now() - startMs;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const report: Phase11SdkCheckReport = {
    phase: 'Phase 11',
    taskId: 'TA-P11-008',
    generatedAt: new Date().toISOString(),
    summary: {
      createGroupOk,
      sendMessageOk,
      pullMessageOk,
      integratesWithin30Minutes: elapsedMs <= 30 * 60 * 1000,
    },
    decision:
      createGroupOk
      && sendMessageOk
      && pullMessageOk
      && elapsedMs <= 30 * 60 * 1000
        ? 'PASS'
        : 'FAIL',
    details: {
      elapsedMs,
      groupId: created.group.groupId,
      envelopeId: sent.envelopeId,
      mailboxCount: pulled.items.length,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${toJson(report)}\n`, 'utf8');

  console.log(`[TA-P11-008] createGroupOk=${createGroupOk}`);
  console.log(`[TA-P11-008] sendMessageOk=${sendMessageOk}`);
  console.log(`[TA-P11-008] pullMessageOk=${pullMessageOk}`);
  console.log(`[TA-P11-008] integratesWithin30Minutes=${elapsedMs <= 30 * 60 * 1000} elapsedMs=${elapsedMs}`);
  console.log(`[TA-P11-008] decision=${report.decision}`);
  console.log(`[TA-P11-008] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 11 sdk quickstart check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P11-008] execution failed');
  console.error(error);
  process.exitCode = 1;
});
