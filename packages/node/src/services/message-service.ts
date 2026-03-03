import { randomUUID } from 'node:crypto';

import {
  ErrorCodes,
  TelagentError,
  hashDid,
  isDidClaw,
  type Envelope,
} from '@telagent/protocol';

import type { GroupService } from './group-service.js';
import { SequenceAllocator } from './sequence-allocator.js';
import type { MessageRepository, StoredEnvelopeRecord } from '../storage/message-repository.js';

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

const SystemClock: MessageServiceClock = {
  now: () => Date.now(),
};

export interface CleanupReport {
  removed: number;
  remaining: number;
  sweptAtMs: number;
}

export interface ProvisionalRetractionRecord {
  envelopeId: string;
  conversationId: string;
  reason: 'REORGED_BACK';
  retractedAtMs: number;
}

export interface ProvisionalRetractionReport {
  retracted: number;
  checkedAtMs: number;
}

export interface MessageMaintenanceReport {
  cleanup: CleanupReport;
  retraction: ProvisionalRetractionReport;
}

export class MessageService {
  private envelopes: Envelope[] = [];
  private readonly envelopeById = new Map<string, Envelope>();
  private readonly idempotencySignatureByEnvelopeId = new Map<string, string>();
  private readonly retractedByEnvelopeId = new Map<string, ProvisionalRetractionRecord>();
  private readonly sequenceAllocator: SequenceAllocator;
  private readonly clock: MessageServiceClock;
  private readonly repository?: MessageRepository;

  constructor(
    private readonly groups: GroupService,
    options?: { sequenceAllocator?: SequenceAllocator; clock?: MessageServiceClock; repository?: MessageRepository },
  ) {
    this.sequenceAllocator = options?.sequenceAllocator ?? new SequenceAllocator();
    this.clock = options?.clock ?? SystemClock;
    this.repository = options?.repository;
  }

  send(input: SendMessageInput): Envelope {
    const nowMs = this.clock.now();
    this.runMaintenance(nowMs);

    const envelopeId = input.envelopeId ?? randomUUID();
    const signature = this.buildIdempotencySignature(input);

    const existing = this.getEnvelopeById(envelopeId);
    if (existing) {
      const existingSignature = this.getIdempotencySignature(envelopeId);
      if (existingSignature !== signature) {
        throw new TelagentError(
          ErrorCodes.CONFLICT,
          `envelopeId(${envelopeId}) already exists with a different payload`,
        );
      }
      return existing;
    }
    const existingSignature = this.getIdempotencySignature(envelopeId);
    if (existingSignature) {
      if (existingSignature !== signature) {
        throw new TelagentError(
          ErrorCodes.CONFLICT,
          `envelopeId(${envelopeId}) already exists with a different payload`,
        );
      }
      const retracted = this.getRetraction(envelopeId);
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

    const seq = this.nextSequence(input.conversationId);

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
      sentAtMs: this.clock.now(),
      ttlSec: input.ttlSec,
      provisional,
    };

    this.persistEnvelope({
      envelope,
      idempotencySignature: signature,
    });

    return envelope;
  }

  pull(params: { cursor?: string; limit?: number; conversationId?: string }): {
    items: Envelope[];
    nextCursor: string | null;
  } {
    this.runMaintenance();

    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
    const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

    const total = this.countEnvelopes(params.conversationId);
    const items = this.listEnvelopes({
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

  runMaintenance(nowMs = this.clock.now()): MessageMaintenanceReport {
    return {
      cleanup: this.cleanupExpired(nowMs),
      retraction: this.retractProvisionalOnReorg(nowMs),
    };
  }

  listRetracted(limit = 50): ProvisionalRetractionRecord[] {
    if (this.repository) {
      return this.repository.listRetractions(limit);
    }

    return Array.from(this.retractedByEnvelopeId.values())
      .sort((a, b) => b.retractedAtMs - a.retractedAtMs)
      .slice(0, Math.max(1, limit));
  }

  cleanupExpired(nowMs = this.clock.now()): CleanupReport {
    if (this.repository) {
      const result = this.repository.deleteExpired(nowMs);
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

  retractProvisionalOnReorg(nowMs = this.clock.now()): ProvisionalRetractionReport {
    if (this.repository) {
      let retracted = 0;
      const provisionalRecords = this.repository.listProvisionalGroupRecords();

      for (const record of provisionalRecords) {
        const groupId = this.resolveGroupId(record.envelope.conversationId);
        const chainState = this.groups.getChainState(groupId);
        if (chainState.state !== 'REORGED_BACK') {
          continue;
        }

        retracted++;
        this.repository.retractEnvelope({
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

  private persistEnvelope(record: StoredEnvelopeRecord): void {
    if (this.repository) {
      this.repository.saveEnvelope(record);
      return;
    }

    this.envelopeById.set(record.envelope.envelopeId, record.envelope);
    this.idempotencySignatureByEnvelopeId.set(record.envelope.envelopeId, record.idempotencySignature);
    this.envelopes.push(record.envelope);
  }

  private getEnvelopeById(envelopeId: string): Envelope | null {
    if (this.repository) {
      return this.repository.getEnvelopeRecord(envelopeId)?.envelope ?? null;
    }
    return this.envelopeById.get(envelopeId) ?? null;
  }

  private getIdempotencySignature(envelopeId: string): string | null {
    if (this.repository) {
      return this.repository.getIdempotencySignature(envelopeId);
    }
    return this.idempotencySignatureByEnvelopeId.get(envelopeId) ?? null;
  }

  private getRetraction(envelopeId: string): ProvisionalRetractionRecord | null {
    if (this.repository) {
      return this.repository.getRetraction(envelopeId);
    }
    return this.retractedByEnvelopeId.get(envelopeId) ?? null;
  }

  private countEnvelopes(conversationId?: string): number {
    if (this.repository) {
      return this.repository.countEnvelopes(conversationId);
    }

    if (!conversationId) {
      return this.envelopes.length;
    }
    return this.envelopes.filter((item) => item.conversationId === conversationId).length;
  }

  private listEnvelopes(params: { conversationId?: string; offset: number; limit: number }): Envelope[] {
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

  private nextSequence(conversationId: string): bigint {
    if (this.repository) {
      return this.repository.nextSequence(conversationId);
    }
    return this.sequenceAllocator.next(conversationId);
  }
}
