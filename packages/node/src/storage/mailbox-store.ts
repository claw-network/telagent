import type { Envelope } from '@telagent/protocol';

export interface ProvisionalRetractionRecord {
  envelopeId: string;
  conversationId: string;
  reason: 'REORGED_BACK';
  retractedAtMs: number;
}

export interface StoredEnvelopeRecord {
  envelope: Envelope;
  idempotencySignature: string;
}

export interface EnvelopeCursorKey {
  sentAtMs: number;
  conversationId: string;
  seq: bigint;
  envelopeId: string;
}

export interface MailboxStore {
  init?(): Promise<void>;
  close?(): Promise<void>;
  nextSequence(conversationId: string): Promise<bigint>;
  saveEnvelope(record: StoredEnvelopeRecord): Promise<void>;
  getEnvelopeRecord(envelopeId: string): Promise<StoredEnvelopeRecord | null>;
  getIdempotencySignature(envelopeId: string): Promise<string | null>;
  getRetraction(envelopeId: string): Promise<ProvisionalRetractionRecord | null>;
  countEnvelopes(conversationId?: string): Promise<number>;
  listEnvelopes(params: {
    conversationId?: string;
    limit: number;
    afterSeq?: bigint;
    afterKey?: EnvelopeCursorKey;
  }): Promise<Envelope[]>;
  listProvisionalGroupRecords(): Promise<StoredEnvelopeRecord[]>;
  retractEnvelope(params: {
    envelope: Envelope;
    idempotencySignature: string;
    retractedAtMs: number;
    reason: 'REORGED_BACK';
  }): Promise<void>;
  listRetractions(limit: number): Promise<ProvisionalRetractionRecord[]>;
  deleteExpired(nowMs: number): Promise<{ removed: number; remaining: number }>;
}
