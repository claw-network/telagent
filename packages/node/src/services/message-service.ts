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

export interface MessageDidRevocationEvent {
  did: string;
  didHash: string;
  revokedAtMs: number;
  source: string;
}

export interface MessageIdentityService {
  assertActiveDid(rawDid: string): Promise<unknown>;
  subscribeDidRevocations?(listener: (event: MessageDidRevocationEvent) => void): () => void;
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

export interface MessageSessionIsolationRecord {
  conversationId: string;
  conversationIdHash: string;
  revokedDidHash: string;
  isolatedAtMs: number;
  source: string;
}

export interface MessageDidIsolationEvent {
  didHash: string;
  revokedAtMs: number;
  source: string;
  isolatedConversationCount: number;
  evictedConversationCount: number;
  isolatedConversationIdHashes: string[];
}

export interface MessageAuditSnapshot {
  activeEnvelopeCount: number;
  retractedCount: number;
  retractedByReason: Record<'REORGED_BACK', number>;
  sampledRetractions: MessageAuditRetractionSample[];
  revokedDidCount: number;
  isolatedConversationCount: number;
  isolationEventCount: number;
  sampledIsolations: Array<{
    conversationIdHash: string;
    revokedDidHash: string;
    isolatedAtMs: number;
    source: string;
  }>;
  sampledIsolationEvents: Array<{
    didHash: string;
    revokedAtMs: number;
    source: string;
    isolatedConversationCount: number;
    evictedConversationCount: number;
  }>;
  sampleSize: number;
  retractionScanLimit: number;
}

interface GlobalPullCursorKey {
  sentAtMs: number;
  conversationId: string;
  seq: bigint;
  envelopeId: string;
}

const GLOBAL_PULL_CURSOR_PREFIX = 'g1.';

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
  private readonly conversationIdsByDidHash = new Map<string, Set<string>>();
  private readonly activeConversationIds = new Set<string>();
  private readonly isolatedConversationById = new Map<string, MessageSessionIsolationRecord>();
  private readonly isolationEvents: MessageDidIsolationEvent[] = [];
  private readonly revokedDidHashes = new Set<string>();
  private disposeRevocationSubscription?: () => void;

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

    if (this.identityService?.subscribeDidRevocations) {
      this.disposeRevocationSubscription = this.identityService.subscribeDidRevocations((event) => {
        this.recordDidRevocation(event);
      });
    }
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
    const senderDidHash = this.normalizeHash(hashDid(input.senderDid));
    this.assertConversationNotIsolated(input.conversationId);
    this.assertDidNotRevoked(input.senderDid, senderDidHash);

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
      const senderRecord = members.find((item) => this.normalizeHash(item.didHash) === senderDidHash);

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
    this.recordConversationActivity(senderDidHash, input.conversationId);

    return envelope;
  }

  async pull(params: { cursor?: string; limit?: number; conversationId?: string }): Promise<{
    items: Envelope[];
    nextCursor: string | null;
  }> {
    await this.runMaintenance();

    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const cursor = this.parsePullCursor(params.cursor, params.conversationId);
    const itemsWithProbe = await this.listEnvelopes({
      conversationId: params.conversationId,
      limit: limit + 1,
      afterSeq: cursor.afterSeq,
      afterKey: cursor.afterKey,
    });
    const hasMore = itemsWithProbe.length > limit;
    const items = hasMore ? itemsWithProbe.slice(0, limit) : itemsWithProbe;
    const tail = items[items.length - 1];

    return {
      items,
      nextCursor:
        hasMore && tail
          ? params.conversationId
            ? tail.seq.toString()
            : this.encodeGlobalPullCursor(tail)
          : null,
    };
  }

  async runMaintenance(nowMs = this.clock.now()): Promise<MessageMaintenanceReport> {
    return {
      cleanup: await this.cleanupExpired(nowMs),
      retraction: await this.retractProvisionalOnReorg(nowMs),
    };
  }

  dispose(): void {
    if (this.disposeRevocationSubscription) {
      this.disposeRevocationSubscription();
      this.disposeRevocationSubscription = undefined;
    }
  }

  async listRetracted(limit = 50): Promise<ProvisionalRetractionRecord[]> {
    if (this.repository) {
      return this.repository.listRetractions(limit);
    }

    return Array.from(this.retractedByEnvelopeId.values())
      .sort((a, b) => b.retractedAtMs - a.retractedAtMs)
      .slice(0, Math.max(1, limit));
  }

  listIsolatedConversations(limit = 50): MessageSessionIsolationRecord[] {
    return Array.from(this.isolatedConversationById.values())
      .sort((left, right) => right.isolatedAtMs - left.isolatedAtMs)
      .slice(0, Math.max(1, limit))
      .map((item) => ({ ...item }));
  }

  listIsolationEvents(limit = 50): MessageDidIsolationEvent[] {
    return this.isolationEvents
      .slice()
      .sort((left, right) => right.revokedAtMs - left.revokedAtMs)
      .slice(0, Math.max(1, limit))
      .map((item) => ({
        ...item,
        isolatedConversationIdHashes: [...item.isolatedConversationIdHashes],
      }));
  }

  recordDidRevocation(event: MessageDidRevocationEvent): MessageDidIsolationEvent {
    if (!isDidClaw(event.did)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'DID must use did:claw format');
    }

    const didHash = this.normalizeHash(event.didHash);
    const revokedAtMs = this.normalizePositiveInt(event.revokedAtMs, this.clock.now(), Number.MAX_SAFE_INTEGER);
    const source = event.source.trim() || 'unknown';

    this.revokedDidHashes.add(didHash);

    const relatedConversationIds = new Set<string>([
      ...this.listTrackedConversationsByDidHash(didHash),
      ...this.findGroupConversationsByDidHash(didHash),
    ]);

    let evictedConversationCount = 0;
    const isolatedConversationIdHashes: string[] = [];
    for (const conversationId of relatedConversationIds) {
      if (!this.isolatedConversationById.has(conversationId)) {
        this.isolatedConversationById.set(conversationId, {
          conversationId,
          conversationIdHash: this.digestForAudit(conversationId),
          revokedDidHash: didHash,
          isolatedAtMs: revokedAtMs,
          source,
        });
      }
      const current = this.isolatedConversationById.get(conversationId)!;
      isolatedConversationIdHashes.push(current.conversationIdHash);

      if (this.activeConversationIds.delete(conversationId)) {
        evictedConversationCount += 1;
      }
    }

    const isolationEvent: MessageDidIsolationEvent = {
      didHash,
      revokedAtMs,
      source,
      isolatedConversationCount: relatedConversationIds.size,
      evictedConversationCount,
      isolatedConversationIdHashes,
    };
    this.isolationEvents.push(isolationEvent);

    return {
      ...isolationEvent,
      isolatedConversationIdHashes: [...isolationEvent.isolatedConversationIdHashes],
    };
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
      revokedDidCount: this.revokedDidHashes.size,
      isolatedConversationCount: this.isolatedConversationById.size,
      isolationEventCount: this.isolationEvents.length,
      sampledIsolations: this.listIsolatedConversations(sampleSize).map((entry) => ({
        conversationIdHash: entry.conversationIdHash,
        revokedDidHash: entry.revokedDidHash,
        isolatedAtMs: entry.isolatedAtMs,
        source: entry.source,
      })),
      sampledIsolationEvents: this.listIsolationEvents(sampleSize).map((entry) => ({
        didHash: entry.didHash,
        revokedAtMs: entry.revokedAtMs,
        source: entry.source,
        isolatedConversationCount: entry.isolatedConversationCount,
        evictedConversationCount: entry.evictedConversationCount,
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

  private recordConversationActivity(didHash: string, conversationId: string): void {
    this.activeConversationIds.add(conversationId);

    const bucket = this.conversationIdsByDidHash.get(didHash);
    if (bucket) {
      bucket.add(conversationId);
      return;
    }

    this.conversationIdsByDidHash.set(didHash, new Set([conversationId]));
  }

  private listTrackedConversationsByDidHash(didHash: string): string[] {
    return [...(this.conversationIdsByDidHash.get(didHash) ?? [])];
  }

  private findGroupConversationsByDidHash(didHash: string): string[] {
    const groupReader = this.groups as unknown as {
      listGroups?: () => Array<{ groupId: string }>;
      listMembers?: (groupId: string) => Array<{ didHash: string; state: string }>;
    };

    if (typeof groupReader.listGroups !== 'function' || typeof groupReader.listMembers !== 'function') {
      return [];
    }

    const matched: string[] = [];
    for (const group of groupReader.listGroups()) {
      if (!group?.groupId) {
        continue;
      }

      try {
        const members = groupReader.listMembers(group.groupId);
        const containsDid = members.some((member) =>
          this.normalizeHash(member.didHash) === didHash && member.state !== 'REMOVED'
        );
        if (containsDid) {
          matched.push(`group:${group.groupId}`);
        }
      } catch {
        // group may not be queryable for all adapters/mocks; skip best-effort
      }
    }

    return matched;
  }

  private assertConversationNotIsolated(conversationId: string): void {
    if (!this.isolatedConversationById.has(conversationId)) {
      return;
    }
    throw new TelagentError(
      ErrorCodes.UNPROCESSABLE,
      `conversation(${conversationId}) is isolated due to revoked DID`,
    );
  }

  private assertDidNotRevoked(senderDid: string, didHash: string): void {
    if (!this.revokedDidHashes.has(didHash)) {
      return;
    }
    throw new TelagentError(
      ErrorCodes.UNPROCESSABLE,
      `senderDid(${senderDid}) is revoked and isolated`,
    );
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

  private async listEnvelopes(params: {
    conversationId?: string;
    limit: number;
    afterSeq?: bigint;
    afterKey?: GlobalPullCursorKey;
  }): Promise<Envelope[]> {
    if (this.repository) {
      return this.repository.listEnvelopes(params);
    }

    const filtered = this.envelopes.filter((item) => {
      if (params.conversationId && item.conversationId !== params.conversationId) {
        return false;
      }
      return true;
    });

    const sorted = filtered.sort((left, right) => {
      if (params.conversationId) {
        if (left.seq !== right.seq) {
          return left.seq < right.seq ? -1 : 1;
        }
        return left.envelopeId.localeCompare(right.envelopeId);
      }

      if (left.sentAtMs !== right.sentAtMs) {
        return left.sentAtMs - right.sentAtMs;
      }
      if (left.conversationId !== right.conversationId) {
        return left.conversationId.localeCompare(right.conversationId);
      }
      if (left.seq !== right.seq) {
        return left.seq < right.seq ? -1 : 1;
      }
      return left.envelopeId.localeCompare(right.envelopeId);
    });

    const sliced = sorted.filter((item) => {
      if (params.conversationId) {
        if (typeof params.afterSeq === 'undefined') {
          return true;
        }
        return item.seq > params.afterSeq;
      }

      if (!params.afterKey) {
        return true;
      }

      if (item.sentAtMs !== params.afterKey.sentAtMs) {
        return item.sentAtMs > params.afterKey.sentAtMs;
      }
      if (item.conversationId !== params.afterKey.conversationId) {
        return item.conversationId > params.afterKey.conversationId;
      }
      if (item.seq !== params.afterKey.seq) {
        return item.seq > params.afterKey.seq;
      }
      return item.envelopeId > params.afterKey.envelopeId;
    });

    return sliced.slice(0, params.limit);
  }

  private parsePullCursor(cursorRaw: string | undefined, conversationId?: string): {
    afterSeq?: bigint;
    afterKey?: GlobalPullCursorKey;
  } {
    if (!cursorRaw || !cursorRaw.trim()) {
      return {};
    }

    const cursor = cursorRaw.trim();
    if (conversationId) {
      if (!/^\d+$/.test(cursor)) {
        throw new TelagentError(
          ErrorCodes.VALIDATION,
          'cursor must be a non-negative integer sequence for conversation pull',
        );
      }
      return {
        afterSeq: BigInt(cursor),
      };
    }

    if (!cursor.startsWith(GLOBAL_PULL_CURSOR_PREFIX)) {
      throw new TelagentError(
        ErrorCodes.VALIDATION,
        'cursor must use keyset format when conversation_id is omitted',
      );
    }

    const encoded = cursor.slice(GLOBAL_PULL_CURSOR_PREFIX.length);
    if (!encoded) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'cursor payload is empty');
    }

    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
      const sentAtMs = parsed.sentAtMs;
      const cursorConversationId = parsed.conversationId;
      const seq = parsed.seq;
      const envelopeId = parsed.envelopeId;

      if (typeof sentAtMs !== 'number' || !Number.isInteger(sentAtMs) || sentAtMs < 0) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'cursor.sentAtMs must be a non-negative integer');
      }
      if (typeof cursorConversationId !== 'string' || !cursorConversationId.trim()) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'cursor.conversationId must be a non-empty string');
      }
      if (typeof seq !== 'string' || !/^\d+$/.test(seq)) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'cursor.seq must be a non-negative integer string');
      }
      if (typeof envelopeId !== 'string' || !envelopeId.trim()) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'cursor.envelopeId must be a non-empty string');
      }

      return {
        afterKey: {
          sentAtMs,
          conversationId: cursorConversationId,
          seq: BigInt(seq),
          envelopeId,
        },
      };
    } catch (error) {
      if (error instanceof TelagentError) {
        throw error;
      }
      throw new TelagentError(ErrorCodes.VALIDATION, 'cursor is malformed');
    }
  }

  private encodeGlobalPullCursor(envelope: Envelope): string {
    const payload = {
      sentAtMs: envelope.sentAtMs,
      conversationId: envelope.conversationId,
      seq: envelope.seq.toString(),
      envelopeId: envelope.envelopeId,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${GLOBAL_PULL_CURSOR_PREFIX}${encoded}`;
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

  private normalizeHash(value: string): string {
    return value.trim().toLowerCase();
  }

  private digestForAudit(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
