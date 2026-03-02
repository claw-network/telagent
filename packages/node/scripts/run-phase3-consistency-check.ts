import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContractProvider } from '../src/services/contract-provider.js';
import type { ChainConfig } from '../src/services/chain-config.js';
import { GroupRepository } from '../src/storage/group-repository.js';

interface P2IntegrationManifest {
  flow: {
    groupId: string;
    txHashes: {
      createGroup: string;
      inviteMember: string;
      acceptInvite: string;
      removeMember: string;
    };
  };
  dids: {
    owner: { did: string; didHash: string };
    member: { did: string; didHash: string };
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function chainMemberStateFromRepo(state: string | undefined): number {
  if (state === 'PENDING') return 1;
  if (state === 'FINALIZED') return 2;
  if (state === 'REMOVED') return 3;
  return 0;
}

function chainMemberStateLabel(value: number): string {
  if (value === 1) return 'Pending';
  if (value === 2) return 'Finalized';
  if (value === 3) return 'Removed';
  return 'None';
}

function didFromHash(hash: string): string {
  if (!hash || !hash.startsWith('0x')) {
    return 'did:claw:unknown';
  }
  return `did:claw:${hash.slice(2, 18)}`;
}

function replayEvent(
  repo: GroupRepository,
  eventName: string,
  payload: Record<string, unknown>,
  txHash?: string,
  blockNumber?: number,
): void {
  if (eventName === 'GroupCreated') {
    const groupId = String(payload.groupId ?? '');
    const creatorDidHash = String(payload.creatorDidHash ?? '');
    const domainProofHash = String(payload.domainProofHash ?? '0x' + '0'.repeat(64));

    repo.saveGroup({
      groupId,
      creatorDid: didFromHash(creatorDidHash),
      creatorDidHash,
      groupDomain: '',
      domainProofHash,
      initialMlsStateHash: '0x' + '0'.repeat(64),
      state: 'ACTIVE',
      createdAtMs: Date.now(),
      txHash,
      blockNumber,
    });

    repo.saveMember({
      groupId,
      did: didFromHash(creatorDidHash),
      didHash: creatorDidHash,
      state: 'FINALIZED',
      joinedAtMs: Date.now(),
      txHash,
    });

    repo.saveChainState({
      groupId,
      state: 'ACTIVE',
      finalizedTxHash: txHash,
      blockNumber,
      updatedAtMs: Date.now(),
    });
    return;
  }

  if (eventName === 'MemberInvited') {
    const groupId = String(payload.groupId ?? '');
    const inviteId = String(payload.inviteId ?? '');
    const inviteeDidHash = String(payload.inviteeDidHash ?? '');

    repo.saveMember({
      groupId,
      did: didFromHash(inviteeDidHash),
      didHash: inviteeDidHash,
      state: 'PENDING',
      joinedAtMs: Date.now(),
      inviteId,
      txHash,
    });
    return;
  }

  if (eventName === 'MemberAccepted') {
    const groupId = String(payload.groupId ?? '');
    const inviteId = String(payload.inviteId ?? '');
    const memberDidHash = String(payload.memberDidHash ?? '');

    repo.saveMember({
      groupId,
      did: didFromHash(memberDidHash),
      didHash: memberDidHash,
      state: 'FINALIZED',
      joinedAtMs: Date.now(),
      inviteId,
      txHash,
    });
    return;
  }

  if (eventName === 'MemberRemoved') {
    const groupId = String(payload.groupId ?? '');
    const memberDidHash = String(payload.memberDidHash ?? '');

    repo.saveMember({
      groupId,
      did: didFromHash(memberDidHash),
      didHash: memberDidHash,
      state: 'REMOVED',
      joinedAtMs: Date.now(),
      txHash,
    });
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const manifestPath =
    process.env.P3_INPUT_MANIFEST_PATH ??
    path.resolve(repoRoot, 'docs/implementation/phase-2/manifests/2026-03-02-p2-testnet-integration.json');
  const outputPath =
    process.env.P3_OUTPUT_MANIFEST_PATH ??
    path.resolve(repoRoot, 'docs/implementation/phase-3/manifests/2026-03-02-p3-consistency-check.json');

  const rpcUrl = process.env.TELAGENT_CHAIN_RPC_URL ?? 'https://rpc.clawnetd.com';
  const chainId = Number(process.env.TELAGENT_CHAIN_ID ?? 7625);

  const privateKey = required('TELAGENT_PRIVATE_KEY');
  const identityAddress = required('TELAGENT_IDENTITY_CONTRACT');
  const tokenAddress = required('TELAGENT_TOKEN_CONTRACT');
  const registryAddress = required('TELAGENT_GROUP_REGISTRY_CONTRACT');

  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as P2IntegrationManifest;

  process.env.TELAGENT_PRIVATE_KEY = privateKey;

  const chainConfig: ChainConfig = {
    rpcUrl,
    chainId,
    contracts: {
      identity: identityAddress,
      token: tokenAddress,
      telagentGroupRegistry: registryAddress,
    },
    signer: {
      type: 'env',
      envVar: 'TELAGENT_PRIVATE_KEY',
    },
    selfDid: manifest.dids.owner.did,
    finalityDepth: 12,
  };

  const contracts = new ContractProvider(chainConfig);
  const dbDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telagent-p3-consistency-'));
  const repoPath = process.env.P3_CONSISTENCY_DB_PATH ?? path.join(dbDir, 'group-indexer.sqlite');
  const repo = new GroupRepository(repoPath);

  try {
    const txHashes = Object.values(manifest.flow.txHashes);
    const receipts = await Promise.all(txHashes.map((txHash) => contracts.provider.getTransactionReceipt(txHash)));
    const mined = receipts.filter((receipt): receipt is NonNullable<typeof receipt> => {
      return !!receipt && typeof receipt.blockNumber === 'number';
    });

    if (mined.length === 0) {
      throw new Error('No transaction receipts found from integration manifest');
    }

    const minBlock = Math.min(...mined.map((receipt) => receipt.blockNumber));
    const maxBlock = Math.max(...mined.map((receipt) => receipt.blockNumber));

    const logs = await contracts.provider.getLogs({
      address: await contracts.telagentGroupRegistry.getAddress(),
      fromBlock: minBlock,
      toBlock: maxBlock,
    });

    for (const log of logs) {
      const parsed = contracts.telagentGroupRegistry.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (!parsed) {
        continue;
      }

      const payload: Record<string, unknown> = {};
      for (let i = 0; i < parsed.fragment.inputs.length; i++) {
        const input = parsed.fragment.inputs[i];
        payload[input.name || `arg${i}`] = String(parsed.args[i]);
      }

      const groupId = String(payload.groupId ?? '');
      if (!groupId) {
        continue;
      }

      repo.recordEvent({
        groupId,
        eventName: parsed.name,
        txHash: log.transactionHash,
        blockNumber: typeof log.blockNumber === 'number' ? log.blockNumber : undefined,
        payload,
      });

      replayEvent(
        repo,
        parsed.name,
        payload,
        log.transactionHash,
        typeof log.blockNumber === 'number' ? log.blockNumber : undefined,
      );
    }

    const groupId = manifest.flow.groupId;
    const ownerHash = manifest.dids.owner.didHash.toLowerCase();
    const memberHash = manifest.dids.member.didHash.toLowerCase();

    const repoGroup = repo.getGroup(groupId);
    const repoMembers = repo.listMembers(groupId);

    const chainGroup = (await contracts.telagentGroupRegistry.getGroup(groupId)) as {
      active?: boolean;
      6?: boolean;
    };

    const chainOwnerState = Number(
      await contracts.telagentGroupRegistry.getMemberState(groupId, manifest.dids.owner.didHash),
    );
    const chainMemberState = Number(
      await contracts.telagentGroupRegistry.getMemberState(groupId, manifest.dids.member.didHash),
    );

    const repoOwner = repoMembers.find((member) => member.didHash.toLowerCase() === ownerHash);
    const repoMember = repoMembers.find((member) => member.didHash.toLowerCase() === memberHash);

    const mismatches: string[] = [];

    const chainActive = Boolean(chainGroup.active ?? chainGroup[6]);
    if (!repoGroup) {
      mismatches.push('group missing from read model');
    } else if (chainActive && repoGroup.state !== 'ACTIVE') {
      mismatches.push(`group state mismatch: chain=ACTIVE, repo=${repoGroup.state}`);
    }

    const ownerExpected = chainMemberStateFromRepo(repoOwner?.state);
    if (chainOwnerState !== ownerExpected) {
      mismatches.push(
        `owner member state mismatch: chain=${chainMemberStateLabel(chainOwnerState)}, repo=${chainMemberStateLabel(ownerExpected)}`,
      );
    }

    const memberExpected = chainMemberStateFromRepo(repoMember?.state);
    if (chainMemberState !== memberExpected) {
      mismatches.push(
        `member state mismatch: chain=${chainMemberStateLabel(chainMemberState)}, repo=${chainMemberStateLabel(memberExpected)}`,
      );
    }

    const report = {
      phase: 'Phase 3',
      taskId: 'TA-P3-007',
      inputManifest: manifestPath,
      outputPath,
      network: {
        rpcUrl,
        chainId,
        telagentGroupRegistryAddress: registryAddress,
      },
      replayWindow: {
        minBlock,
        maxBlock,
      },
      checks: {
        groupId,
        chainActive,
        repoGroupState: repoGroup?.state ?? null,
        chainOwnerState: chainMemberStateLabel(chainOwnerState),
        repoOwnerState: repoOwner?.state ?? 'None',
        chainMemberState: chainMemberStateLabel(chainMemberState),
        repoMemberState: repoMember?.state ?? 'None',
      },
      mismatchCount: mismatches.length,
      mismatches,
      executedAt: new Date().toISOString(),
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await contracts.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
