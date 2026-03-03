import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Interface, type Log } from 'ethers';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { TELAGENT_GROUP_REGISTRY_ABI } from '../src/services/abis.js';
import type { ContractProvider } from '../src/services/contract-provider.js';
import { FederationService } from '../src/services/federation-service.js';
import { GroupIndexer } from '../src/indexer/group-indexer.js';
import { GroupRepository } from '../src/storage/group-repository.js';

interface ChainBlock {
  number: number;
  hash: string;
  parentHash: string;
}

interface DrillResult {
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
}

class FaultInjectionProvider {
  private blocks = new Map<number, ChainBlock>();
  private logsByBlock = new Map<number, Log[]>();
  private head = 0;
  private failGetLogsRemaining = 0;
  private failGetLogsMessage = 'RPC timeout';

  setChain(blocks: Map<number, ChainBlock>, logsByBlock: Map<number, Log[]>): void {
    this.blocks = blocks;
    this.logsByBlock = logsByBlock;
    this.head = Math.max(0, ...blocks.keys());
  }

  setHead(head: number): void {
    this.head = head;
  }

  failNextGetLogs(times: number, message: string): void {
    this.failGetLogsRemaining = Math.max(0, times);
    this.failGetLogsMessage = message;
  }

  async getBlockNumber(): Promise<number> {
    return this.head;
  }

  async getBlock(blockNumber: number): Promise<ChainBlock | null> {
    return this.blocks.get(blockNumber) ?? null;
  }

  async getLogs(filter: { fromBlock?: number; toBlock?: number; address?: string }): Promise<Log[]> {
    if (this.failGetLogsRemaining > 0) {
      this.failGetLogsRemaining -= 1;
      throw new Error(this.failGetLogsMessage);
    }

    const fromBlock = Number(filter.fromBlock ?? 0);
    const toBlock = Number(filter.toBlock ?? this.head);
    const address = (filter.address ?? '').toLowerCase();

    const logs: Log[] = [];
    for (let block = fromBlock; block <= toBlock; block++) {
      const bucket = this.logsByBlock.get(block) ?? [];
      for (const item of bucket) {
        if (!address || item.address.toLowerCase() === address) {
          logs.push(item);
        }
      }
    }
    return logs;
  }
}

function bytes32FromSeed(seed: string): string {
  const hex = Buffer.from(seed).toString('hex');
  return `0x${hex.padStart(64, '0').slice(-64)}`;
}

function buildLinearChain(length: number, tag: string): Map<number, ChainBlock> {
  const blocks = new Map<number, ChainBlock>();
  let parentHash = bytes32FromSeed(`${tag}-genesis`);
  for (let i = 1; i <= length; i++) {
    const hash = bytes32FromSeed(`${tag}-block-${i}`);
    blocks.set(i, {
      number: i,
      hash,
      parentHash,
    });
    parentHash = hash;
  }
  return blocks;
}

function forkFrom(base: Map<number, ChainBlock>, forkFromBlock: number, tag: string): Map<number, ChainBlock> {
  const maxBlock = Math.max(0, ...base.keys());
  const next = new Map<number, ChainBlock>();
  for (let i = 1; i <= forkFromBlock; i++) {
    const block = base.get(i);
    if (block) {
      next.set(i, block);
    }
  }

  let parentHash = next.get(forkFromBlock)?.hash ?? bytes32FromSeed(`${tag}-genesis`);
  for (let i = forkFromBlock + 1; i <= maxBlock; i++) {
    const hash = bytes32FromSeed(`${tag}-block-${i}`);
    next.set(i, {
      number: i,
      hash,
      parentHash,
    });
    parentHash = hash;
  }
  return next;
}

function makeLog(params: {
  iface: Interface;
  address: string;
  eventName: string;
  args: readonly unknown[];
  blockNumber: number;
  blockHash: string;
  txSeed: string;
}): Log {
  const fragment = params.iface.getEvent(params.eventName);
  if (!fragment) {
    throw new Error(`event not found: ${params.eventName}`);
  }

  const encoded = params.iface.encodeEventLog(fragment, params.args);
  return {
    address: params.address,
    data: encoded.data,
    topics: encoded.topics,
    blockNumber: params.blockNumber,
    blockHash: params.blockHash,
    transactionHash: bytes32FromSeed(params.txSeed),
    logIndex: 0,
    transactionIndex: 0,
    removed: false,
    index: 0,
  } as unknown as Log;
}

function buildContracts(provider: FaultInjectionProvider, iface: Interface, address: string): ContractProvider {
  return {
    provider,
    config: { finalityDepth: 12 },
    telagentGroupRegistry: {
      interface: iface,
      getAddress: async () => address,
    },
  } as unknown as ContractProvider;
}

function errorCodeOf(error: unknown): string {
  if (error instanceof TelagentError) {
    return error.code;
  }
  return 'UNKNOWN';
}

async function runChainCongestionDrill(repoRoot: string): Promise<DrillResult> {
  const iface = new Interface(TELAGENT_GROUP_REGISTRY_ABI);
  const contractAddress = `0x${'a'.repeat(40)}`;
  const groupId = `0x${'1'.repeat(64)}`;
  const creatorDidHash = `0x${'2'.repeat(64)}`;

  const blocks = buildLinearChain(18, 'congest');
  const logsByBlock = new Map<number, Log[]>();
  logsByBlock.set(14, [
    makeLog({
      iface,
      address: contractAddress,
      eventName: 'GroupCreated',
      args: [groupId, creatorDidHash, bytes32FromSeed('domain-congest'), `0x${'3'.repeat(64)}`, 14],
      blockNumber: 14,
      blockHash: blocks.get(14)?.hash ?? bytes32FromSeed('missing-14'),
      txSeed: 'congest-group-created',
    }),
  ]);

  const provider = new FaultInjectionProvider();
  provider.setChain(blocks, logsByBlock);
  provider.setHead(18);
  provider.failNextGetLogs(1, 'RPC_TIMEOUT_DURING_CONGESTION');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telagent-p5-drill-congest-'));
  const repo = new GroupRepository(path.join(tmpDir, 'group-indexer.sqlite'));
  const contracts = buildContracts(provider, iface, contractAddress);
  const indexer = new GroupIndexer(contracts, repo, { finalityDepth: 2, pollIntervalMs: 3_600_000 });

  let firstError = '';
  try {
    await indexer.catchUp();
  } catch (error) {
    firstError = error instanceof Error ? error.message : String(error);
  }

  await indexer.catchUp();

  const state = repo.getIndexerState();
  const group = repo.getGroup(groupId);
  const passed = firstError.includes('RPC_TIMEOUT_DURING_CONGESTION') && !!state && state.lastIndexedBlock === 16 && !!group;

  await fs.rm(tmpDir, { recursive: true, force: true });

  return {
    name: 'chain-congestion',
    passed,
    details: {
      firstAttemptError: firstError || null,
      recoveredLastIndexedBlock: state?.lastIndexedBlock ?? null,
      groupRecovered: !!group,
    },
  };
}

async function runReorgDrill(): Promise<DrillResult> {
  const iface = new Interface(TELAGENT_GROUP_REGISTRY_ABI);
  const contractAddress = `0x${'b'.repeat(40)}`;
  const groupId = `0x${'4'.repeat(64)}`;
  const inviteIdA = `0x${'5'.repeat(64)}`;
  const inviteIdB = `0x${'6'.repeat(64)}`;
  const creatorDidHash = `0x${'7'.repeat(64)}`;
  const inviteeDidHashA = `0x${'8'.repeat(64)}`;
  const inviteeDidHashB = `0x${'9'.repeat(64)}`;

  const chainA = buildLinearChain(15, 'reorg-a');
  const logsA = new Map<number, Log[]>();
  logsA.set(8, [
    makeLog({
      iface,
      address: contractAddress,
      eventName: 'GroupCreated',
      args: [groupId, creatorDidHash, bytes32FromSeed('domain-reorg'), `0x${'a'.repeat(64)}`, 8],
      blockNumber: 8,
      blockHash: chainA.get(8)?.hash ?? bytes32FromSeed('missing-8'),
      txSeed: 'reorg-group-created',
    }),
  ]);
  logsA.set(9, [
    makeLog({
      iface,
      address: contractAddress,
      eventName: 'MemberInvited',
      args: [groupId, inviteIdA, creatorDidHash, inviteeDidHashA, `0x${'b'.repeat(64)}`],
      blockNumber: 9,
      blockHash: chainA.get(9)?.hash ?? bytes32FromSeed('missing-9'),
      txSeed: 'reorg-invite-a',
    }),
  ]);

  const provider = new FaultInjectionProvider();
  provider.setChain(chainA, logsA);
  provider.setHead(15);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telagent-p5-drill-reorg-'));
  const repo = new GroupRepository(path.join(tmpDir, 'group-indexer.sqlite'));
  const contracts = buildContracts(provider, iface, contractAddress);
  const indexer = new GroupIndexer(contracts, repo, { finalityDepth: 0, pollIntervalMs: 3_600_000 });

  await indexer.catchUp();
  const pendingBefore = repo.listMembers(groupId, 'PENDING').map((item) => item.didHash);

  const chainB = forkFrom(chainA, 8, 'reorg-b');
  const logsB = new Map<number, Log[]>();
  logsB.set(8, logsA.get(8) ?? []);
  logsB.set(9, [
    makeLog({
      iface,
      address: contractAddress,
      eventName: 'MemberInvited',
      args: [groupId, inviteIdB, creatorDidHash, inviteeDidHashB, `0x${'c'.repeat(64)}`],
      blockNumber: 9,
      blockHash: chainB.get(9)?.hash ?? bytes32FromSeed('missing-fork-9'),
      txSeed: 'reorg-invite-b',
    }),
  ]);
  provider.setChain(chainB, logsB);
  provider.setHead(15);

  await indexer.catchUp();
  const pendingAfter = repo.listMembers(groupId, 'PENDING').map((item) => item.didHash);
  const reorgCount = repo.getIndexerState()?.reorgCount ?? 0;

  const passed = pendingBefore.length === 1 && pendingBefore[0] === inviteeDidHashA
    && pendingAfter.length === 1
    && pendingAfter[0] === inviteeDidHashB
    && reorgCount === 1;

  await fs.rm(tmpDir, { recursive: true, force: true });

  return {
    name: 'reorg-recovery',
    passed,
    details: {
      pendingBefore,
      pendingAfter,
      reorgCount,
    },
  };
}

async function runFederationFailureDrill(): Promise<DrillResult> {
  let nowMs = 1_000_000;
  const federation = new FederationService({
    selfDomain: 'node-a.tel',
    authToken: 'shared-secret',
    allowedSourceDomains: ['node-b.tel'],
    envelopeRateLimitPerMinute: 3,
    groupStateSyncRateLimitPerMinute: 2,
    receiptRateLimitPerMinute: 2,
    clock: {
      now: () => nowMs,
    },
  });

  const details: Record<string, unknown> = {};

  try {
    federation.receiveEnvelope({ envelopeId: 'env-1' }, { sourceDomain: 'node-b.tel' });
  } catch (error) {
    details.unauthorizedError = errorCodeOf(error);
  }

  try {
    federation.receiveEnvelope({ envelopeId: 'env-1' }, { sourceDomain: 'node-c.tel', authToken: 'shared-secret' });
  } catch (error) {
    details.forbiddenSourceError = errorCodeOf(error);
  }

  const first = federation.receiveEnvelope(
    { envelopeId: 'env-1', payload: 'ok' },
    { sourceDomain: 'node-b.tel', authToken: 'shared-secret' },
  );
  const dedupe = federation.receiveEnvelope(
    { envelopeId: 'env-1', payload: 'ok' },
    { sourceDomain: 'node-b.tel', authToken: 'shared-secret' },
  );
  const second = federation.receiveEnvelope(
    { envelopeId: 'env-2', payload: 'ok' },
    { sourceDomain: 'node-b.tel', authToken: 'shared-secret' },
  );

  let rateLimitCode = '';
  try {
    federation.receiveEnvelope(
      { envelopeId: 'env-3', payload: 'rate-limit' },
      { sourceDomain: 'node-b.tel', authToken: 'shared-secret' },
    );
  } catch (error) {
    rateLimitCode = errorCodeOf(error);
  }

  nowMs += 61_000;
  const afterWindow = federation.receiveEnvelope(
    { envelopeId: 'env-3', payload: 'rate-limit' },
    { sourceDomain: 'node-b.tel', authToken: 'shared-secret' },
  );

  let domainMismatchCode = '';
  try {
    federation.syncGroupState(
      {
        groupId: `0x${'d'.repeat(64)}`,
        state: 'ACTIVE',
        groupDomain: 'node-c.tel',
      },
      { sourceDomain: 'node-b.tel', authToken: 'shared-secret' },
    );
  } catch (error) {
    domainMismatchCode = errorCodeOf(error);
  }

  const syncOk = federation.syncGroupState(
    {
      groupId: `0x${'d'.repeat(64)}`,
      state: 'ACTIVE',
      groupDomain: 'node-b.tel',
    },
    { sourceDomain: 'node-b.tel', authToken: 'shared-secret' },
  );

  const passed = details.unauthorizedError === ErrorCodes.UNAUTHORIZED
    && details.forbiddenSourceError === ErrorCodes.FORBIDDEN
    && first.accepted
    && !first.deduplicated
    && dedupe.deduplicated
    && second.accepted
    && rateLimitCode === ErrorCodes.TOO_MANY_REQUESTS
    && afterWindow.accepted
    && domainMismatchCode === ErrorCodes.FORBIDDEN
    && syncOk.synced;

  return {
    name: 'federation-failure',
    passed,
    details: {
      ...details,
      firstEnvelope: first,
      dedupeEnvelope: dedupe,
      secondEnvelope: second,
      rateLimitError: rateLimitCode,
      afterWindow,
      domainMismatchError: domainMismatchCode,
      syncRecovered: syncOk,
    },
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const outputPath =
    process.env.P5_FAULT_INJECTION_OUTPUT_PATH ??
    path.resolve(repoRoot, 'docs/implementation/phase-5/manifests/2026-03-03-p5-fault-injection-drill.json');

  const results = await Promise.all([
    runChainCongestionDrill(repoRoot),
    runReorgDrill(),
    runFederationFailureDrill(),
  ]);

  const failed = results.filter((item) => !item.passed);
  const report = {
    phase: 'Phase 5',
    taskId: 'TA-P5-003',
    executedAt: new Date().toISOString(),
    scenarios: results,
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      passRate: results.length > 0 ? (results.length - failed.length) / results.length : 0,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
