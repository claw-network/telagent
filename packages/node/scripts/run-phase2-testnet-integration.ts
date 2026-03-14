import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  Contract,
  JsonRpcProvider,
  Wallet,
  keccak256,
  toUtf8Bytes,
} from 'ethers';

import { GroupService } from '../src/services/group-service.js';
import { GasService } from '../src/services/gas-service.js';
import { IdentityAdapterService } from '../src/services/identity-adapter-service.js';
import { ContractProvider } from '../src/services/contract-provider.js';
import type { ChainConfig } from '../src/services/chain-config.js';
import { GroupRepository } from '../src/storage/group-repository.js';

const CLAW_IDENTITY_REGISTER_ABI = [
  'function isActive(bytes32 didHash) view returns (bool)',
  'function getController(bytes32 didHash) view returns (address)',
  'function batchRegisterDID(bytes32[] didHashes, bytes[] publicKeys, uint8[] purposes, address[] controllers)',
];

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function bytes32FromLabel(label: string): string {
  return keccak256(toUtf8Bytes(label));
}

function createDid(prefix: string): string {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  return `did:claw:${prefix}${suffix}`;
}

async function ensureDidRegistered(
  identity: Contract,
  wallet: Wallet,
  did: string,
): Promise<{ did: string; didHash: string; created: boolean }> {
  const didHash = keccak256(toUtf8Bytes(did));
  const isActive = (await identity.isActive(didHash)) as boolean;
  if (isActive) {
    const controller = ((await identity.getController(didHash)) as string).toLowerCase();
    if (controller !== wallet.address.toLowerCase()) {
      throw new Error(`DID already exists with different controller: ${did}`);
    }
    return { did, didHash, created: false };
  }

  const publicKey = `0x${Buffer.from(randomBytes(32)).toString('hex')}`;
  const tx = await identity.batchRegisterDID([didHash], [publicKey], [0], [wallet.address]);
  const receipt = await tx.wait();
  if (receipt?.status !== 1n && receipt?.status !== 1) {
    throw new Error(`batchRegisterDID failed for ${did}`);
  }

  const activeAfter = (await identity.isActive(didHash)) as boolean;
  if (!activeAfter) {
    throw new Error(`DID not active after register: ${did}`);
  }

  return { did, didHash, created: true };
}

async function main() {
  const rpcUrl = process.env.TELAGENT_CHAIN_RPC_URL ?? 'https://rpc.clawnetd.com';
  const chainId = Number(process.env.TELAGENT_CHAIN_ID ?? 7625);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const privateKey = required('TELAGENT_PRIVATE_KEY');
  const identityAddress = required('TELAGENT_IDENTITY_CONTRACT');
  const tokenAddress = required('TELAGENT_TOKEN_CONTRACT');
  const registryAddress = required('TELAGENT_GROUP_REGISTRY_CONTRACT');
  const outputPath =
    process.env.P2_INTEGRATION_RECORD_PATH ??
    path.resolve(repoRoot, 'docs/implementation/phase-2/manifests/2026-03-02-p2-testnet-integration.json');

  const provider = new JsonRpcProvider(rpcUrl, { chainId, name: 'clawnet-testnet' });
  const wallet = new Wallet(privateKey, provider);

  const identity = new Contract(identityAddress, CLAW_IDENTITY_REGISTER_ABI, wallet);

  const ownerDid = createDid('zP2Owner');
  const memberDid = createDid('zP2Member');

  const ownerReg = await ensureDidRegistered(identity, wallet, ownerDid);
  const memberReg = await ensureDidRegistered(identity, wallet, memberDid);

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
    selfDid: ownerDid,
    finalityDepth: 12,
  };

  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telagent-p2-int-'));
  const repoPath = path.join(dataDir, 'group-indexer.sqlite');

  const contracts = await ContractProvider.create(chainConfig);
  const repo = new GroupRepository(repoPath);
  const identityAdapter = new IdentityAdapterService(contracts);
  const gasService = new GasService(contracts);
  const groupService = new GroupService(contracts, identityAdapter, gasService, repo);

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const groupId = bytes32FromLabel(`p2-group-${runId}`);
  const inviteId = bytes32FromLabel(`p2-invite-${runId}`);
  const domainProofHash = bytes32FromLabel(`p2-domain-proof-${runId}`);
  const initialMlsStateHash = bytes32FromLabel(`p2-mls-init-${runId}`);
  const inviteCommitHash = bytes32FromLabel(`p2-mls-commit-${runId}`);
  const welcomeHash = bytes32FromLabel(`p2-mls-welcome-${runId}`);
  const removeCommitHash = bytes32FromLabel(`p2-mls-remove-${runId}`);

  const createResult = await groupService.createGroup({
    creatorDid: ownerDid,
    groupId,
    groupDomain: 'phase2-integration.tel',
    domainProofHash,
    initialMlsStateHash,
  });

  const inviteResult = await groupService.inviteMember({
    groupId,
    inviteId,
    inviterDid: ownerDid,
    inviteeDid: memberDid,
    mlsCommitHash: inviteCommitHash,
  });

  const acceptResult = await groupService.acceptInvite({
    groupId,
    inviteId,
    inviteeDid: memberDid,
    mlsWelcomeHash: welcomeHash,
  });

  const removeResult = await groupService.removeMember({
    groupId,
    operatorDid: ownerDid,
    memberDid,
    mlsCommitHash: removeCommitHash,
  });

  const chainState = groupService.getChainState(groupId);
  const finalizedMembers = groupService.listMembers(groupId, 'FINALIZED');
  const removedMembers = groupService.listMembers(groupId, 'REMOVED');

  const record = {
    phase: 'Phase 2',
    taskId: 'TA-P2-010',
    network: {
      rpcUrl,
      chainId,
      identityAddress,
      tokenAddress,
      telagentGroupRegistryAddress: registryAddress,
    },
    signer: wallet.address,
    dids: {
      owner: ownerReg,
      member: memberReg,
    },
    flow: {
      groupId,
      inviteId,
      txHashes: {
        createGroup: createResult.txHash,
        inviteMember: inviteResult.txHash,
        acceptInvite: acceptResult.txHash,
        removeMember: removeResult.txHash,
      },
    },
    viewChecks: {
      chainState,
      finalizedMembersCount: finalizedMembers.length,
      removedMembersCount: removedMembers.length,
    },
    executedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(record, null, 2));

  console.log(JSON.stringify(record, null, 2));

  await contracts.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
