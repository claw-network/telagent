import { randomUUID } from 'node:crypto';

import {
  ErrorCodes,
  TelagentError,
  hashDid,
  isDidClaw,
  type Envelope,
  type MembershipState,
} from '@telagent/protocol';

import type { GroupService } from './group-service.js';

export interface SendMessageInput {
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

export class MessageService {
  private readonly envelopes: Envelope[] = [];
  private readonly seenEnvelopeIds = new Set<string>();
  private readonly seqMap = new Map<string, bigint>();

  constructor(private readonly groups: GroupService) {}

  send(input: SendMessageInput): Envelope {
    if (!isDidClaw(input.senderDid)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'senderDid must use did:claw format');
    }

    let provisional = false;
    if (input.conversationType === 'group') {
      const groupId = this.resolveGroupId(input.conversationId);
      const chainState = this.groups.getChainState(groupId);
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

    const seq = (this.seqMap.get(input.conversationId) ?? 0n) + 1n;
    this.seqMap.set(input.conversationId, seq);

    const envelope: Envelope = {
      envelopeId: randomUUID(),
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
      sentAtMs: Date.now(),
      ttlSec: input.ttlSec,
      provisional,
    };

    if (!this.seenEnvelopeIds.has(envelope.envelopeId)) {
      this.seenEnvelopeIds.add(envelope.envelopeId);
      this.envelopes.push(envelope);
    }

    return envelope;
  }

  pull(params: { cursor?: string; limit?: number; conversationId?: string }): {
    items: Envelope[];
    nextCursor: string | null;
  } {
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
    const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

    const now = Date.now();
    const filtered = this.envelopes.filter((item) => {
      if (params.conversationId && item.conversationId !== params.conversationId) {
        return false;
      }
      const expiresAtMs = item.sentAtMs + item.ttlSec * 1000;
      return expiresAtMs > now;
    });

    const sorted = filtered.sort((a, b) => {
      if (a.conversationId === b.conversationId) {
        return a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0;
      }
      return a.sentAtMs - b.sentAtMs;
    });

    const items = sorted.slice(safeOffset, safeOffset + limit);
    const nextOffset = safeOffset + items.length;

    return {
      items,
      nextCursor: nextOffset < sorted.length ? String(nextOffset) : null,
    };
  }

  private resolveGroupId(conversationId: string): string {
    if (conversationId.startsWith('group:')) {
      return conversationId.slice('group:'.length);
    }
    return conversationId;
  }
}
