// ============================================================
// ClawNetGatewayService
// ============================================================
// 职责：
//   1. 封装 @claw-network/sdk 的 ClawNetClient
//   2. 所有写操作通过 SessionManager 注入 passphrase
//   3. 所有写操作通过 NonceManager 自动管理 nonce
//   4. nonce 冲突自动重试（最多 3 次）
//   5. 只读操作直接透传，不需要 session
// ============================================================

import { ClawNetClient } from '@claw-network/sdk';
import type { SessionManager, OperationScope } from './session-manager.js';
import type { NonceManager } from './nonce-manager.js';

export interface ClawNetGatewayConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface IdentityInfo {
  did: string;
  address: string;
  isActive: boolean;
  controller: string;
  activeKey: string;
  document?: Record<string, unknown>;
}

export interface BalanceInfo {
  native: string;
  token: string;
  did: string;
  address: string;
}

export interface TransferResult {
  txHash: string;
  nonce?: number;
}

export interface EscrowInfo {
  id: string;
  creator?: string;
  beneficiary: string;
  amount: number;
  status: string;
}

export interface TaskInfo {
  id: string;
  title: string;
  status: string;
  owner: string;
}

export interface BidInfo {
  id: string;
  bidder: string;
  amount: number;
  status: string;
}

export interface ReputationInfo {
  did: string;
  score: number;
  reviewCount: number;
}

export class ClawNetGatewayService {
  public readonly client: ClawNetClient;
  private readonly unsafeClient: any;

  constructor(
    private readonly config: ClawNetGatewayConfig,
    private readonly sessionManager: SessionManager,
    private readonly nonceManager: NonceManager,
  ) {
    this.client = new ClawNetClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? 30_000,
    });
    this.unsafeClient = this.client as any;
  }

  async getSelfIdentity(): Promise<IdentityInfo> {
    const result = await this.unsafeClient.identity.get();
    return result as IdentityInfo;
  }

  async resolveIdentity(did: string): Promise<IdentityInfo> {
    const result = await this.unsafeClient.identity.resolve(did);
    return result as IdentityInfo;
  }

  async getBalance(did?: string): Promise<BalanceInfo> {
    const result = await this.unsafeClient.wallet.getBalance(did ? { did } : undefined);
    return result as BalanceInfo;
  }

  async getNonce(did?: string): Promise<{ nonce: number; address: string }> {
    return this.unsafeClient.wallet.getNonce(did ? { did } : undefined) as Promise<{ nonce: number; address: string }>;
  }

  async getEscrow(escrowId: string): Promise<EscrowInfo> {
    const result = await this.unsafeClient.wallet.getEscrow(escrowId);
    return result as EscrowInfo;
  }

  async listTasks(filters?: Record<string, unknown>): Promise<TaskInfo[]> {
    const result = await this.unsafeClient.markets.tasks.list(filters);
    return result as TaskInfo[];
  }

  async listBids(taskId: string): Promise<BidInfo[]> {
    const listBids = this.unsafeClient.markets.tasks.listBids
      ?? this.unsafeClient.markets.tasks.getBids;
    const result = await listBids.call(this.unsafeClient.markets.tasks, taskId);
    return result as BidInfo[];
  }

  async getReputation(did: string): Promise<ReputationInfo> {
    const getter = this.unsafeClient.reputation.get
      ?? this.unsafeClient.reputation.resolve
      ?? this.unsafeClient.reputation.getProfile;
    const result = await getter.call(this.unsafeClient.reputation, did);
    return result as ReputationInfo;
  }

  async healthCheck(): Promise<{ healthy: boolean; did?: string }> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/api/v1/node`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return { healthy: false };
      const body = await resp.json() as { data?: { did?: string } };
      return { healthy: true, did: body?.data?.did };
    } catch {
      return { healthy: false };
    }
  }

  async getAgentProfile(did: string): Promise<{ identity: IdentityInfo; reputation: ReputationInfo | null }> {
    const [identity, reputation] = await Promise.all([
      this.resolveIdentity(did),
      this.getReputation(did).catch(() => null),
    ]);
    return { identity, reputation };
  }

  async getWalletHistory(did?: string, params?: { limit?: number; offset?: number }): Promise<unknown[]> {
    const result = await this.unsafeClient.wallet.getHistory(did ? { did, ...params } : params);
    return result as unknown[];
  }

  async searchMarkets(params?: { q?: string; type?: string }): Promise<unknown[]> {
    const result = await this.unsafeClient.markets.search(params as any);
    return result as unknown[];
  }

  async createServiceContract(
    sessionToken: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return this.executeWithNonceRetry(sessionToken, 'contract', 1,
      (did, passphrase, nonce) => this.unsafeClient.contracts.create({ did, passphrase, nonce, ...params }),
    );
  }

  async transfer(
    sessionToken: string,
    params: { to: string; amount: number; memo?: string },
  ): Promise<TransferResult> {
    return this.executeWithNonceRetry(sessionToken, 'transfer', 1,
      (did, passphrase, nonce) => this.unsafeClient.wallet.transfer({ did, passphrase, nonce, ...params }),
    );
  }

  async createEscrow(
    sessionToken: string,
    params: { beneficiary: string; amount: number; releaseRules?: unknown[] },
  ): Promise<EscrowInfo> {
    return this.executeWithNonceRetry(sessionToken, 'escrow', 1,
      (did, passphrase, nonce) => this.unsafeClient.wallet.createEscrow({ did, passphrase, nonce, ...params }),
    );
  }

  async releaseEscrow(
    sessionToken: string,
    params: { escrowId: string },
  ): Promise<unknown> {
    return this.executeWithNonceRetry(sessionToken, 'escrow', 1,
      (did, passphrase, nonce) => {
        const releaser = this.unsafeClient.wallet.releaseEscrow;
        try {
          return releaser.call(this.unsafeClient.wallet, {
            did,
            passphrase,
            nonce,
            escrowId: params.escrowId,
          });
        } catch {
          return releaser.call(this.unsafeClient.wallet, params.escrowId, {
            did,
            passphrase,
            nonce,
          });
        }
      },
    );
  }

  async publishTask(
    sessionToken: string,
    params: { title: string; description: string; budget: number; tags?: string[] },
  ): Promise<TaskInfo> {
    return this.executeWithNonceRetry(sessionToken, 'market', 1,
      (did, passphrase, nonce) => this.unsafeClient.markets.tasks.publish({ did, passphrase, nonce, ...params }),
    );
  }

  async bid(
    sessionToken: string,
    params: { taskId: string; amount: number; proposal?: string },
  ): Promise<BidInfo> {
    return this.executeWithNonceRetry(sessionToken, 'market', 1,
      (did, passphrase, nonce) => this.unsafeClient.markets.tasks.bid(params.taskId, {
        did,
        passphrase,
        nonce,
        amount: params.amount,
        proposal: params.proposal,
      }),
    );
  }

  async acceptBid(
    sessionToken: string,
    params: { taskId: string; bidId: string },
  ): Promise<unknown> {
    return this.executeWithNonceRetry(sessionToken, 'market', 5,
      (did, passphrase, nonce) => this.unsafeClient.markets.tasks.acceptBid(params.taskId, {
        did,
        passphrase,
        nonce,
        bidId: params.bidId,
      }),
    );
  }

  async submitReview(
    sessionToken: string,
    params: { targetDid: string; score: number; comment?: string; orderId?: string },
  ): Promise<unknown> {
    return this.executeWithNonceRetry(sessionToken, 'reputation', 1,
      (did, passphrase, nonce) => {
        const submit = this.unsafeClient.reputation.submit
          ?? this.unsafeClient.reputation.create
          ?? this.unsafeClient.reputation.review;
        return submit.call(this.unsafeClient.reputation, {
          did,
          passphrase,
          nonce,
          ...params,
        });
      },
    );
  }

  private async executeWithNonceRetry<T>(
    sessionToken: string,
    scope: OperationScope,
    nonceCount: number,
    operation: (did: string, passphrase: string, nonce: number) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    const { did, passphrase } = this.sessionManager.resolvePassphrase(sessionToken, scope);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const nonce = nonceCount === 1
        ? await this.nonceManager.next(did)
        : await this.nonceManager.nextBatch(did, nonceCount);

      try {
        return await operation(did, passphrase, nonce);
      } catch (error) {
        if (this.isNonceConflict(error) && attempt < maxRetries - 1) {
          this.nonceManager.rollback(did, nonce);
          await this.nonceManager.sync(did);
          continue;
        }
        throw error;
      }
    }

    throw new Error('Nonce conflict: max retries exceeded');
  }

  private isNonceConflict(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('nonce')
        || error.message.includes('NONCE')
        || error.message.includes('duplicate event');
    }
    return false;
  }
}
