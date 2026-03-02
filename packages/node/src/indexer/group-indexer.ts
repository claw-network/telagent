import type { Log } from 'ethers';

import type { ContractProvider } from '../services/contract-provider.js';
import type { GroupRepository } from '../storage/group-repository.js';

export class GroupIndexer {
  private interval: NodeJS.Timeout | null = null;
  private lastIndexedBlock = 0;

  constructor(
    private readonly contracts: ContractProvider,
    private readonly repo: GroupRepository,
    private readonly options: { pollIntervalMs?: number; finalityDepth?: number } = {},
  ) {}

  async start(): Promise<void> {
    if (this.interval) {
      return;
    }

    const head = await this.contracts.provider.getBlockNumber();
    this.lastIndexedBlock = head;

    const intervalMs = this.options.pollIntervalMs ?? 5_000;
    this.interval = setInterval(() => {
      void this.catchUp();
    }, intervalMs);
  }

  async stop(): Promise<void> {
    if (!this.interval) {
      return;
    }
    clearInterval(this.interval);
    this.interval = null;
  }

  async catchUp(): Promise<void> {
    const finalityDepth = this.options.finalityDepth ?? this.contracts.config.finalityDepth;
    const head = await this.contracts.provider.getBlockNumber();
    const targetBlock = Math.max(0, head - finalityDepth);

    if (targetBlock <= this.lastIndexedBlock) {
      return;
    }

    const logs = await this.contracts.provider.getLogs({
      address: await this.contracts.telagentGroupRegistry.getAddress(),
      fromBlock: this.lastIndexedBlock + 1,
      toBlock: targetBlock,
    });

    for (const log of logs) {
      this.processLog(log);
    }

    this.lastIndexedBlock = targetBlock;
  }

  private processLog(log: Log): void {
    const parsed = this.contracts.telagentGroupRegistry.interface.parseLog({
      topics: [...log.topics],
      data: log.data,
    });

    if (!parsed) {
      return;
    }

    if (parsed.name === 'GroupCreated') {
      const groupId = parsed.args[0] as string;
      const creatorDidHash = parsed.args[1] as string;
      const domainProofHash = parsed.args[3] as string;

      const existing = this.repo.getGroup(groupId);
      if (existing) {
        this.repo.updateGroupState(groupId, 'ACTIVE', log.transactionHash, log.blockNumber);
      } else {
        this.repo.saveGroup({
          groupId,
          creatorDid: `did:claw:${creatorDidHash.slice(2, 18)}`,
          creatorDidHash,
          groupDomain: '',
          domainProofHash,
          initialMlsStateHash: '0x' + '0'.repeat(64),
          state: 'ACTIVE',
          createdAtMs: Date.now(),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }

      this.repo.saveChainState({
        groupId,
        state: 'ACTIVE',
        finalizedTxHash: log.transactionHash,
        blockNumber: log.blockNumber,
        updatedAtMs: Date.now(),
      });
    }

    if (parsed.name === 'MemberInvited') {
      const groupId = parsed.args[0] as string;
      const inviteId = parsed.args[1] as string;
      const inviteeDidHash = parsed.args[3] as string;

      this.repo.saveMember({
        groupId,
        did: `did:claw:${inviteeDidHash.slice(2, 18)}`,
        didHash: inviteeDidHash,
        state: 'PENDING',
        joinedAtMs: Date.now(),
        inviteId,
        txHash: log.transactionHash,
      });
    }

    if (parsed.name === 'MemberAccepted') {
      const groupId = parsed.args[0] as string;
      const inviteId = parsed.args[1] as string;
      const memberDidHash = parsed.args[2] as string;

      this.repo.saveMember({
        groupId,
        did: `did:claw:${memberDidHash.slice(2, 18)}`,
        didHash: memberDidHash,
        state: 'FINALIZED',
        joinedAtMs: Date.now(),
        inviteId,
        txHash: log.transactionHash,
      });
    }

    if (parsed.name === 'MemberRemoved') {
      const groupId = parsed.args[0] as string;
      const memberDidHash = parsed.args[1] as string;

      this.repo.saveMember({
        groupId,
        did: `did:claw:${memberDidHash.slice(2, 18)}`,
        didHash: memberDidHash,
        state: 'REMOVED',
        joinedAtMs: Date.now(),
        txHash: log.transactionHash,
      });
    }

    const groupId = (parsed.args[0] as string | undefined) ?? '';
    if (groupId) {
      const payload: Record<string, unknown> = {};
      for (let i = 0; i < parsed.fragment.inputs.length; i++) {
        const input = parsed.fragment.inputs[i];
        payload[input.name || `arg${i}`] = String(parsed.args[i]);
      }
      this.repo.recordEvent({
        groupId,
        eventName: parsed.name,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        payload,
      });
    }
  }
}
