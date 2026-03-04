import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface CheckOptions {
  nodeA: {
    url: string;
    did: string;
    domain: string;
    mailboxKeyId: string;
  };
  nodeB: {
    url: string;
    did: string;
    domain: string;
    mailboxKeyId: string;
  };
  timeoutMs: number;
  pollIntervalMs: number;
}

interface CheckReport {
  phase: 'Cross-node Delivery';
  taskId: 'TA-P17-003';
  generatedAt: string;
  input: {
    nodeAUrl: string;
    nodeBUrl: string;
    nodeADid: string;
    nodeBDid: string;
    nodeADomain: string;
    nodeBDomain: string;
  };
  checks: {
    nodeAToNodeB: {
      envelopeId: string;
      delivered: boolean;
      latencyMs: number;
      error?: string;
    };
    nodeBToNodeA: {
      envelopeId: string;
      delivered: boolean;
      latencyMs: number;
      error?: string;
    };
  };
  decision: 'PASS' | 'FAIL';
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value || !value.trim()) {
    throw new Error(`missing required env ${name}`);
  }
  return value.trim();
}

function createOptions(): CheckOptions {
  return {
    nodeA: {
      url: env('TELAGENT_NODE_A_URL'),
      did: env('TELAGENT_NODE_A_DID'),
      domain: env('TELAGENT_NODE_A_DOMAIN'),
      mailboxKeyId: env('TELAGENT_NODE_A_MAILBOX_KEY_ID', 'signal-node-a-v1'),
    },
    nodeB: {
      url: env('TELAGENT_NODE_B_URL'),
      did: env('TELAGENT_NODE_B_DID'),
      domain: env('TELAGENT_NODE_B_DOMAIN'),
      mailboxKeyId: env('TELAGENT_NODE_B_MAILBOX_KEY_ID', 'signal-node-b-v1'),
    },
    timeoutMs: Number.parseInt(env('TELAGENT_CROSS_NODE_TIMEOUT_MS', '30000'), 10),
    pollIntervalMs: Number.parseInt(env('TELAGENT_CROSS_NODE_POLL_INTERVAL_MS', '1000'), 10),
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, currentValue) => (typeof currentValue === 'bigint' ? currentValue.toString() : currentValue),
    2,
  );
}

async function postJson(baseUrl: string, pathname: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function getJson(baseUrl: string, pathname: string): Promise<Response> {
  return fetch(`${baseUrl}${pathname}`);
}

async function ensureSignalKey(baseUrl: string, did: string, keyId: string): Promise<void> {
  const response = await postJson(baseUrl, '/api/v1/keys/register', {
    did,
    suite: 'signal',
    keyId,
    publicKey: `0x${'a'.repeat(64)}`,
  });

  if (response.status === 201 || response.status === 200 || response.status === 409) {
    return;
  }

  const body = await safeBody(response);
  throw new Error(`failed to ensure signal key ${keyId} on ${baseUrl}: ${response.status} ${body}`);
}

async function sendDirectMessage(params: {
  baseUrl: string;
  senderDid: string;
  conversationId: string;
  targetDomain: string;
  mailboxKeyId: string;
  envelopeId: string;
  textSeed: string;
}): Promise<void> {
  const response = await postJson(params.baseUrl, '/api/v1/messages', {
    envelopeId: params.envelopeId,
    senderDid: params.senderDid,
    conversationId: params.conversationId,
    conversationType: 'direct',
    targetDomain: params.targetDomain,
    mailboxKeyId: params.mailboxKeyId,
    sealedHeader: '0x11',
    ciphertext: `0x${params.textSeed}`,
    contentType: 'text',
    ttlSec: 3600,
  });

  if (response.status !== 201) {
    const body = await safeBody(response);
    throw new Error(`send message failed (${params.baseUrl}): ${response.status} ${body}`);
  }
}

async function waitUntilDelivered(params: {
  receiverUrl: string;
  conversationId: string;
  envelopeId: string;
  timeoutMs: number;
  pollIntervalMs: number;
}): Promise<{ delivered: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  const deadline = start + params.timeoutMs;

  while (Date.now() <= deadline) {
    const response = await getJson(
      params.receiverUrl,
      `/api/v1/messages/pull?conversation_id=${encodeURIComponent(params.conversationId)}&limit=50`,
    );

    if (response.status !== 200) {
      const body = await safeBody(response);
      return {
        delivered: false,
        latencyMs: Date.now() - start,
        error: `pull failed (${response.status}): ${body}`,
      };
    }

    const payload = (await response.json()) as {
      data?: {
        items?: Array<{ envelopeId?: string }>;
      };
    };

    const found = payload.data?.items?.some((item) => item.envelopeId === params.envelopeId) ?? false;
    if (found) {
      return {
        delivered: true,
        latencyMs: Date.now() - start,
      };
    }

    await sleep(params.pollIntervalMs);
  }

  return {
    delivered: false,
    latencyMs: Date.now() - start,
    error: 'timeout waiting for envelope delivery',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function safeBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 512);
  } catch {
    return '<unavailable>';
  }
}

async function run(): Promise<CheckReport> {
  const options = createOptions();

  await ensureSignalKey(options.nodeA.url, options.nodeA.did, options.nodeA.mailboxKeyId);
  await ensureSignalKey(options.nodeB.url, options.nodeB.did, options.nodeB.mailboxKeyId);

  const conversationId = `direct:${options.nodeA.did}--${options.nodeB.did}`;
  const envelopeA = `env-cross-node-a-${Date.now()}`;
  const envelopeB = `env-cross-node-b-${Date.now()}`;

  await sendDirectMessage({
    baseUrl: options.nodeA.url,
    senderDid: options.nodeA.did,
    conversationId,
    targetDomain: options.nodeB.domain,
    mailboxKeyId: options.nodeA.mailboxKeyId,
    envelopeId: envelopeA,
    textSeed: 'aa'.repeat(16),
  });

  const nodeAToNodeB = await waitUntilDelivered({
    receiverUrl: options.nodeB.url,
    conversationId,
    envelopeId: envelopeA,
    timeoutMs: options.timeoutMs,
    pollIntervalMs: options.pollIntervalMs,
  });

  await sendDirectMessage({
    baseUrl: options.nodeB.url,
    senderDid: options.nodeB.did,
    conversationId,
    targetDomain: options.nodeA.domain,
    mailboxKeyId: options.nodeB.mailboxKeyId,
    envelopeId: envelopeB,
    textSeed: 'bb'.repeat(16),
  });

  const nodeBToNodeA = await waitUntilDelivered({
    receiverUrl: options.nodeA.url,
    conversationId,
    envelopeId: envelopeB,
    timeoutMs: options.timeoutMs,
    pollIntervalMs: options.pollIntervalMs,
  });

  const decision = nodeAToNodeB.delivered && nodeBToNodeA.delivered ? 'PASS' : 'FAIL';

  return {
    phase: 'Cross-node Delivery',
    taskId: 'TA-P17-003',
    generatedAt: new Date().toISOString(),
    input: {
      nodeAUrl: options.nodeA.url,
      nodeBUrl: options.nodeB.url,
      nodeADid: options.nodeA.did,
      nodeBDid: options.nodeB.did,
      nodeADomain: options.nodeA.domain,
      nodeBDomain: options.nodeB.domain,
    },
    checks: {
      nodeAToNodeB: {
        envelopeId: envelopeA,
        delivered: nodeAToNodeB.delivered,
        latencyMs: nodeAToNodeB.latencyMs,
        error: nodeAToNodeB.error,
      },
      nodeBToNodeA: {
        envelopeId: envelopeB,
        delivered: nodeBToNodeA.delivered,
        latencyMs: nodeBToNodeA.latencyMs,
        error: nodeBToNodeA.error,
      },
    },
    decision,
  };
}

async function main(): Promise<void> {
  const report = await run();

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const reportDir = path.join(rootDir, 'docs', 'implementation', 'phase-17');
  await fs.mkdir(reportDir, { recursive: true });

  const reportPath = path.join(reportDir, 'cross-node-chat-check-report.json');
  await fs.writeFile(reportPath, toJson(report), 'utf8');

  process.stdout.write(`[cross-node] report written: ${reportPath}\n`);
  process.stdout.write(toJson(report));
  process.stdout.write('\n');

  if (report.decision !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`[cross-node] FAILED ${message}\n`);
  process.exitCode = 1;
});
