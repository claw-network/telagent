import { ErrorCodes, TelagentError, hashDid, isDidClaw, type AgentDID } from '@telagent/protocol';
import { publicKeyFromDid, bytesToHex } from '@claw-network/core';

import type { ClawNetGatewayService, IdentityInfo } from '../clawnet/gateway-service.js';
import type { ManagedClawNetNode } from '../clawnet/managed-node.js';
import type { IdentityCache } from '../storage/identity-cache.js';

export interface ResolvedIdentity {
  did: AgentDID;
  didHash: string;
  controller: string;
  publicKey: string;
  isActive: boolean;
  resolvedAtMs: number;
  address: string;
  activeKey: string;
}

export interface DidRevocationEvent {
  did: AgentDID;
  didHash: string;
  revokedAtMs: number;
  source: string;
}

export type DidRevocationListener = (event: DidRevocationEvent) => void;

export class IdentityAdapterService {
  private selfDidCache: AgentDID | null = null;
  private selfAddressCache: string | null = null;
  private readonly revocationListeners = new Set<DidRevocationListener>();
  private identityCache?: IdentityCache;
  private managedNode?: ManagedClawNetNode;

  constructor(
    private readonly gateway: ClawNetGatewayService,
    options?: { identityCache?: IdentityCache; managedNode?: ManagedClawNetNode },
  ) {
    this.identityCache = options?.identityCache;
    this.managedNode = options?.managedNode;
  }

  subscribeDidRevocations(listener: DidRevocationListener): () => void {
    this.revocationListeners.add(listener);
    return () => {
      this.revocationListeners.delete(listener);
    };
  }

  notifyDidRevoked(
    rawDid: string,
    options?: {
      source?: string;
      revokedAtMs?: number;
      didHash?: string;
    },
  ): DidRevocationEvent {
    if (!isDidClaw(rawDid)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'DID must use did:claw format');
    }

    const did = rawDid as AgentDID;
    const event: DidRevocationEvent = {
      did,
      didHash: options?.didHash ?? hashDid(did),
      revokedAtMs: options?.revokedAtMs ?? Date.now(),
      source: options?.source?.trim() || 'manual',
    };

    for (const listener of this.revocationListeners) {
      try {
        listener(event);
      } catch {
        // keep revocation fan-out best-effort to avoid blocking caller path
      }
    }

    return event;
  }

  async getSelf(): Promise<ResolvedIdentity> {
    const info = await this.gateway.getSelfIdentity();
    const resolved = this.toResolvedIdentity(info);
    this.selfDidCache = resolved.did;
    this.selfAddressCache = resolved.address;
    return resolved;
  }

  getSelfDid(): AgentDID {
    if (!this.selfDidCache) {
      throw new TelagentError(ErrorCodes.CONFLICT, 'Identity not initialized. Call init() first.');
    }
    return this.selfDidCache;
  }

  async init(): Promise<void> {
    await this.getSelf();
  }

  /**
   * Ensure the node's own DID is registered on-chain.
   * Uses the embedded ClawNet node's identity service directly (batchRegisterDID)
   * which is the correct internal registration path.
   */
  async ensureRegistered(): Promise<void> {
    const self = await this.getSelf();
    // If controller is a real EVM address (starts with 0x), it's already on-chain
    if (self.controller.startsWith('0x')) {
      return;
    }
    if (!this.managedNode) {
      throw new Error('No managed ClawNet node — cannot auto-register on-chain');
    }
    // Convert the multibase public key to 0x-prefixed hex for the smart contract
    const rawBytes = publicKeyFromDid(self.did);
    const hexKey = `0x${bytesToHex(rawBytes)}`;
    // Register directly via the embedded node's identity service
    const controller = await this.managedNode.ensureRegisteredOnChain(self.did, hexKey);
    if (!controller) {
      throw new Error('Chain identity service unavailable on embedded node');
    }
    // Refresh self identity to pick up chain data
    await this.getSelf();
  }

  async resolve(rawDid: string): Promise<ResolvedIdentity> {
    if (!isDidClaw(rawDid)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'DID must use did:claw format');
    }

    if (this.selfDidCache && rawDid === this.selfDidCache) {
      return this.getSelf();
    }

    // Check disk cache
    const cached = this.identityCache?.get(rawDid);
    if (cached) {
      return {
        did: cached.did as AgentDID,
        didHash: cached.didHash,
        controller: cached.controller,
        publicKey: cached.publicKey,
        isActive: cached.isActive,
        resolvedAtMs: cached.resolvedAtMs,
        address: cached.address,
        activeKey: cached.activeKey,
      };
    }

    const info = await this.gateway.resolveIdentity(rawDid);
    const resolved = this.toResolvedIdentity(info);

    // Write to disk cache
    if (this.identityCache) {
      this.identityCache.set(resolved);
      void this.identityCache.flush();
    }

    return resolved;
  }

  async assertActiveDid(rawDid: string): Promise<ResolvedIdentity> {
    try {
      const identity = await this.resolve(rawDid);
      if (!identity.isActive) {
        this.notifyDidRevoked(identity.did, {
          source: 'identity-active-check',
          revokedAtMs: identity.resolvedAtMs,
          didHash: identity.didHash,
        });
        throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'DID is revoked or inactive');
      }
      return identity;
    } catch (error) {
      if (this.isDidNotFoundError(error) && isDidClaw(rawDid)) {
        const did = rawDid as AgentDID;
        return {
          did,
          didHash: hashDid(did),
          controller: did,
          publicKey: did,
          isActive: true,
          resolvedAtMs: Date.now(),
          address: did,
          activeKey: did,
        };
      }
      throw error;
    }
  }

  private isDidNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('did not found');
  }

  async assertControllerBySigner(rawDid: string): Promise<ResolvedIdentity> {
    const identity = await this.assertActiveDid(rawDid);
    const self = await this.getSelf();
    const signerAddress = (this.selfAddressCache ?? self.address).toLowerCase();
    if (identity.controller.toLowerCase() !== signerAddress) {
      throw new TelagentError(
        ErrorCodes.FORBIDDEN,
        `Signer ${self.address} is not controller for DID ${identity.did}`,
      );
    }
    return identity;
  }

  private toResolvedIdentity(info: IdentityInfo): ResolvedIdentity {
    const did = info.did as AgentDID;
    const controller = (info.controller || info.address || info.did || '').trim();
    const address = (info.address || info.controller || info.did || '').trim();
    const publicKey = (info.activeKey || info.publicKey || info.did || '').trim();

    return {
      did,
      didHash: hashDid(did),
      controller: controller || did,
      publicKey: publicKey || did,
      isActive: info.isActive ?? true,
      resolvedAtMs: Date.now(),
      address: address || did,
      activeKey: publicKey || did,
    };
  }
}
