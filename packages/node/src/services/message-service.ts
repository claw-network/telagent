import { createHash, randomUUID } from 'node:crypto';

import {
  ErrorCodes,
  TelagentError,
  hashDid,
  isDidClaw,
  type Envelope,
} from '@telagent/protocol';

import type { GroupService } from './group-service.js';
import type { KeyLifecycleService, KeySuite } from './key-lifecycle-service.js';
import { SequenceAllocator } from './sequence-allocator.js';
import type {
  MailboxStore,
  ProvisionalRetractionRecord,
  StoredEnvelopeRecord,
} from '../storage/mailbox-store.js';

export interface SendMessageInput {
  envelopeId?: string;
  senderDid: string;
  conversationId: string;
  conversationType: 'direct' | 'group';
  targetDomain: string;
  mailboxKeyId: string;
  sealedHeader: string;
  ciphertext: string;
  contentType: 'text' | 'image' | 'file' | 'control';
  attachmentManifestHash?: string;
  epoch?: number;
  ttlSec: number;
}

export interface MessageServiceClock {
  now(): number;
}

export interface MessageIdentityService {
  assertActiveDid(rawDid: string): Promise<unknown>;
}

const SystemClock: MessageServiceClock = {
  now: () => Date.now(),
};

export interface CleanupReport {
  removed: number;
  remaining: number;
  sweptAtMs: number;
}

export interface ProvisionalRetractionReport {
  retracted: number;
  checkedAtMs: number;
}

export interface MessageMaintenanceReport {
  cleanup: CleanupReport;
  retraction: ProvisionalRetractionReport;
}

export interface MessageAuditRetractionSample {
  envelopeIdHash: string;
  conversationIdHash: string;
  reason: 'REORGED_BACK';
  retractedAtMs: number;
}

export interface MessageAuditSnapshot {
  activeEnvelopeCount: number;
  retractedCount: number;
  retractedByReason: Record<'REORGED_BACK', number>;
  sampledRetractions: MessageAuditRetractionSample[];
  sampleSize: number;
  retractionScanLimit: number;
}

export class MessageService {
  private envelopes: Envelope[] = [];
  private readonly envelopeById = new Map<string, Envelope>();
  private readonly idempotencySignatureByEnvelopeId = new Map<string, string>();
  private readonly retractedByEnvelopeId = new Map<string, ProvisionalRetractionRecord>();
  private readonly sequenceAllocator: SequenceAllocator;
  private readonly clock: MessageServiceClock;
  private readonly repository?: MailboxStore;
  private readonly keyLifecycleService?: KeyLifecycleService;
  private readonly identityService?: MessageIdentityService;

  constructor(
    private readonly groups: GroupService,
    options?: {
      sequenceAllocator?: SequenceAllocator;
      clock?: MessageServiceClock;
      repository?: MailboxStore;
      keyLifecycleService?: KeyLifecycleService;
      identityService?: MessageIdentityService;
    },
  ) {
    this.sequenceAllocator = options?.sequenceAllocator ?? new SequenceAllocator();
    this.clock = options?.clock ?? SystemClock;
    this.repository = options?.repository;
    this.keyLifecycleService = options?.keyLifecycleService;
    this.identityService = options?.identityService;
  }

  async send(input: SendMessageInput): Promise<Envelope> {
    const nowMs = this.clock.now();
    await this.runMaintenance(nowMs);

    const envelopeId = input.envelopeId ?? randomUUID();
    const signature = this.buildIdempotencySignature(input);

    const existing = await this.getEnvelopeById(envelopeId);
    if (existing) {
      const existingSignature = await this.getIdempotencySignature(envelopeId);
      if (existingSignature !== signature) {
        throw new TelagentError(
          ErrorCodes.CONFLICT,
          `envelopeId(${envelopeId}) already exists with a different payload`,
        );
      }
      return existing;
    }
    const existingSignature = await this.getIdempotencySignature(envelopeId);
    if (existingSignature) {
      if (existingSignature !== signature) {
        throw new TelagentError(
          ErrorCodes.CONFLICT,
          `envelopeId(${envelopeId}) already exists with a different payload`,
        );
      }
      const retracted = await this.getRetraction(envelopeId);
      if (retracted) {
        throw new TelagentError(
          ErrorCodes.CONFLICT,
          `envelopeId(${envelopeId}) was retracted due to ${retracted.reason}`,
        );
      }
      throw new TelagentError(ErrorCodes.CONFLICT, `envelopeId(${envelopeId}) already exists`);
    }

    if (!isDidClaw(input.senderDid)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'senderDid must use did:claw format');
    }

    if (this.identityService) {
      await this.identityService.assertActiveDid(input.senderDid);
    }

    if (this.keyLifecycleService) {
      const suite: KeySuite = input.conversationType === 'direct' ? 'signal' : 'mls';
      this.keyLifecycleService.assertCanUseKey({
        did: input.senderDid,
        suite,
        keyId: input.mailboxKeyId,
        atMs: nowMs,
      });
    }

    let provisional = false;
    if (input.conversationType === 'group') {
      const groupId = this.resolveGroupId(input.conversationId);
      const chainState = this.groups.getChainState(groupId);
      if (chainState.state === 'REORGED_BACK') {
        throw new TelagentError(ErrorCodes.CONFLICT, 'Group chain state is REORGED_BACK');
      }
      provisional = chainState.state !== 'ACTIVE';

      const members = this.groups.listMembers(groupId);
      const senderDidHash = hashDid(input.senderDid);
      const senderRecord = members.find((item) => item.didHash.toLowerCase() === senderDidHash.toLowerCase());

      if (!senderRecord) {
        throw new TelagentError(ErrorCodes.FORBIDDEN, 'Sender is not a group member');
      }

      if (senderRecord.state === 'REMOVED') {
        throw new TelagentError(ErrorCodes.FORBIDDEN, 'Sender membership has been removed');
      }
      if (senderRecord.state === 'PENDING') {
        provisional = true;
      }
    }

    const seq = await this.nextSequence(input.conversationId);

    const envelope: Envelope = {
      envelopeId,
      conversationId: input.conversationId,
      conversationType: input.conversationType,
      routeHint: {
        targetDomain: input.targetDomain,
        mailboxKeyId: input.mailboxKeyId,
      },
      sealedHeader: input.sealedHeader,
      seq,
      epoch: input.epoch,
      ciphertext: input.ciphertext,
      contentType: input.contentType,
      attachmentManifestHash: input.attachmentManifestHash,
      sentAtMs: nowMs,
      ttlSec: input.ttlSec,
      provisional,
    };

    await this.persistEnvelope({
      envelope,
      idempotencySignature: signature,
    });

    return envelope;
  }

  async pull(params: { cursor?: string; limit?: number; conversationId?: string }): Promise<{
    items: Envelope[];
    nextCursor: string | null;
  }> {
    await this.runMaintenance();

    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
    const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

    const total = await this.countEnvelopes(params.conversationId);
    const items = await this.listEnvelopes({
      conversationId: params.conversationId,
      offset: safeOffset,
      limit,
    });
    const nextOffset = safeOffset + items.length;

    return {
      items,
      nextCursor: nextOffset < total ? String(nextOffset) : null,
    };
  }

  async runMaintenance(nowMs = this.clock.now()): Promise<MessageMaintenanceReport> {
    return {
      cleanup: await this.cleanupExpired(nowMs),
      retraction: await this.retractProvisionalOnReorg(nowMs),
    };
  }

  async listRetracted(limit = 50): Promise<ProvisionalRetractionRecord[]> {
    if (this.repository) {
      return this.repository.listRetractions(limit);
    }

    return Array.from(this.retractedByEnvelopeId.values())
      .sort((a, b) => b.retractedAtMs - a.retractedAtMs)
      .slice(0, Math.max(1, limit));
  }

  async buildAuditSnapshot(options?: {
    sampleSize?: number;
    retractionScanLimit?: number;
  }): Promise<MessageAuditSnapshot> {
    const sampleSize = this.normalizePositiveInt(options?.sampleSize, 20, 100);
    const retractionScanLimit = this.normalizePositiveInt(options?.retractionScanLimit, 2000, 100_000);

    const [activeEnvelopeCount, retractions] = await Promise.all([
      this.countEnvelopes(),
      this.listRetracted(retractionScanLimit),
    ]);

    const retractedByReason: Record<'REORGED_BACK', number> = {
      REORGED_BACK: 0,
    };
    for (const entry of retractions) {
      retractedByReason[entry.reason] += 1;
    }

    return {
      activeEnvelopeCount,
      retractedCount: retractions.length,
      retractedByReason,
      sampledRetractions: retractions.slice(0, sampleSize).map((entry) => ({
        envelopeIdHash: this.digestForAudit(entry.envelopeId),
        conversationIdHash: this.digestForAudit(entry.conversationId),
        reason: entry.reason,
        retractedAtMs: entry.retractedAtMs,
      })),
      sampleSize,
      retractionScanLimit,
    };
  }

  async cleanupExpired(nowMs = this.clock.now()): Promise<CleanupReport> {
    if (this.repository) {
      const result = await this.repository.deleteExpired(nowMs);
      return {
        removed: result.removed,
        remaining: result.remaining,
        sweptAtMs: nowMs,
      };
    }

    let removed = 0;
    const retained: Envelope[] = [];

    for (const envelope of this.envelopes) {
      if (this.isExpired(envelope, nowMs)) {
        removed++;
        this.envelopeById.delete(envelope.envelopeId);
        this.idempotencySignatureByEnvelopeId.delete(envelope.envelopeId);
      } else {
        retained.push(envelope);
      }
    }

    this.envelopes = retained;
    return {
      removed,
      remaining: retained.length,
      sweptAtMs: nowMs,
    };
  }

  async retractProvisionalOnReorg(nowMs = this.clock.now()): Promise<ProvisionalRetractionReport> {
    if (this.repository) {
      let retracted = 0;
      const provisionalRecords = await this.repository.listProvisionalGroupRecords();

      for (const record of provisionalRecords) {
        const groupId = this.resolveGroupId(record.envelope.conversationId);
        const chainState = this.groups.getChainState(groupId);
        if (chainState.state !== 'REORGED_BACK') {
          continue;
        }

        retracted++;
        await this.repository.retractEnvelope({
          envelope: record.envelope,
          idempotencySignature: record.idempotencySignature,
          retractedAtMs: nowMs,
          reason: 'REORGED_BACK',
        });
      }

      return {
        retracted,
        checkedAtMs: nowMs,
      };
    }

    let retracted = 0;
    const retained: Envelope[] = [];

    for (const envelope of this.envelopes) {
      if (envelope.conversationType !== 'group' || !envelope.provisional) {
        retained.push(envelope);
        continue;
      }

      const groupId = this.resolveGroupId(envelope.conversationId);
      const chainState = this.groups.getChainState(groupId);
      if (chainState.state !== 'REORGED_BACK') {
        retained.push(envelope);
        continue;
      }

      retracted++;
      this.envelopeById.delete(envelope.envelopeId);
      this.retractedByEnvelopeId.set(envelope.envelopeId, {
        envelopeId: envelope.envelopeId,
        conversationId: envelope.conversationId,
        reason: 'REORGED_BACK',
        retractedAtMs: nowMs,
      });
    }

    this.envelopes = retained;
    return {
      retracted,
      checkedAtMs: nowMs,
    };
  }

  private isExpired(envelope: Envelope, nowMs: number): boolean {
    const expiresAtMs = envelope.sentAtMs + envelope.ttlSec * 1000;
    return expiresAtMs <= nowMs;
  }

  private buildIdempotencySignature(input: SendMessageInput): string {
    return JSON.stringify({
      senderDid: input.senderDid,
      conversationId: input.conversationId,
      conversationType: input.conversationType,
      targetDomain: input.targetDomain,
      mailboxKeyId: input.mailboxKeyId,
      sealedHeader: input.sealedHeader,
      ciphertext: input.ciphertext,
      contentType: input.contentType,
      attachmentManifestHash: input.attachmentManifestHash ?? null,
      epoch: input.epoch ?? null,
      ttlSec: input.ttlSec,
    });
  }

  private resolveGroupId(conversationId: string): string {
    if (conversationId.startsWith('group:')) {
      return conversationId.slice('group:'.length);
    }
    return conversationId;
  }

  private async persistEnvelope(record: StoredEnvelopeRecord): Promise<void> {
    if (this.repository) {
      await this.repository.saveEnvelope(record);
      return;
    }

    this.envelopeById.set(record.envelope.envelopeId, record.envelope);
    this.idempotencySignatureByEnvelopeId.set(record.envelope.envelopeId, record.idempotencySignature);
    this.envelopes.push(record.envelope);
  }

  private async getEnvelopeById(envelopeId: string): Promise<Envelope | null> {
    if (this.repository) {
      return (await this.repository.getEnvelopeRecord(envelopeId))?.envelope ?? null;
    }
    return this.envelopeById.get(envelopeId) ?? null;
  }

  private async getIdempotencySignature(envelopeId: string): Promise<string | null> {
    if (this.repository) {
      return this.repository.getIdempotencySignature(envelopeId);
    }
    return this.idempotencySignatureByEnvelopeId.get(envelopeId) ?? null;
  }

  private async getRetraction(envelopeId: string): Promise<ProvisionalRetractionRecord | null> {
    if (this.repository) {
      return this.repository.getRetraction(envelopeId);
    }
    return this.retractedByEnvelopeId.get(envelopeId) ?? null;
  }

  private async countEnvelopes(conversationId?: string): Promise<number> {
    if (this.repository) {
      return this.repository.countEnvelopes(conversationId);
    }

    if (!conversationId) {
      return this.envelopes.length;
    }
    return this.envelopes.filter((item) => item.conversationId === conversationId).length;
  }

  private async listEnvelopes(params: { conversationId?: string; offset: number; limit: number }): Promise<Envelope[]> {
    if (this.repository) {
      return this.repository.listEnvelopes(params);
    }

    const filtered = this.envelopes.filter((item) => {
      if (params.conversationId && item.conversationId !== params.conversationId) {
        return false;
      }
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      if (a.conversationId === b.conversationId) {
        return a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0;
      }
      return a.sentAtMs - b.sentAtMs;
    });

    return sorted.slice(params.offset, params.offset + params.limit);
  }

  private async nextSequence(conversationId: string): Promise<bigint> {
    if (this.repository) {
      return this.repository.nextSequence(conversationId);
    }
    return this.sequenceAllocator.next(conversationId);
  }

  private normalizePositiveInt(value: number | undefined, fallback: number, max: number): number {
    if (typeof value === 'undefined' || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(1, Math.floor(value)));
  }

  private digestForAudit(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
