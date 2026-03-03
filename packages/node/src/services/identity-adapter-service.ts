import { ErrorCodes, TelagentError, hashDid, isDidClaw, type AgentDID } from '@telagent/protocol';

import type { ContractProvider } from './contract-provider.js';

export interface IdentityView {
  did: AgentDID;
  didHash: string;
  controller: string;
  publicKey: string;
  isActive: boolean;
  resolvedAtMs: number;
}

export interface DidRevocationEvent {
  did: AgentDID;
  didHash: string;
  revokedAtMs: number;
  source: string;
}

export type DidRevocationListener = (event: DidRevocationEvent) => void;

export class IdentityAdapterService {
  private readonly revocationListeners = new Set<DidRevocationListener>();

  constructor(private readonly contracts: ContractProvider) {}

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

  async getSelf(): Promise<IdentityView> {
    return this.resolve(this.contracts.config.selfDid);
  }

  async resolve(rawDid: string): Promise<IdentityView> {
    if (!isDidClaw(rawDid)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'DID must use did:claw format');
    }

    const did = rawDid as AgentDID;
    const didHash = hashDid(did);

    const [isActive, controller, activeKey] = await Promise.all([
      this.contracts.identity.isActive(didHash) as Promise<boolean>,
      this.contracts.identity.getController(didHash) as Promise<string>,
      this.contracts.identity.getActiveKey(didHash) as Promise<string>,
    ]);

    if (controller === '0x0000000000000000000000000000000000000000') {
      throw new TelagentError(ErrorCodes.NOT_FOUND, 'DID not registered on ClawIdentity');
    }

    return {
      did,
      didHash,
      controller,
      publicKey: activeKey,
      isActive,
      resolvedAtMs: Date.now(),
    };
  }

  async assertActiveDid(rawDid: string): Promise<IdentityView> {
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
  }

  async assertControllerBySigner(rawDid: string): Promise<IdentityView> {
    const identity = await this.assertActiveDid(rawDid);
    const signerAddress = this.contracts.signerAddress.toLowerCase();
    if (identity.controller.toLowerCase() !== signerAddress) {
      throw new TelagentError(
        ErrorCodes.FORBIDDEN,
        `Signer ${this.contracts.signerAddress} is not controller for DID ${identity.did}`,
      );
    }
    return identity;
  }
}
