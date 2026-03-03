import Database from 'better-sqlite3';

import type { Envelope } from '@telagent/protocol';

import type {
  MailboxStore,
  ProvisionalRetractionRecord,
  StoredEnvelopeRecord,
} from './mailbox-store.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mailbox_envelopes (
  envelope_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  conversation_type TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  mailbox_key_id TEXT NOT NULL,
  sealed_header TEXT NOT NULL,
  seq TEXT NOT NULL,
  epoch INTEGER,
  ciphertext TEXT NOT NULL,
  content_type TEXT NOT NULL,
  attachment_manifest_hash TEXT,
  sent_at_ms INTEGER NOT NULL,
  ttl_sec INTEGER NOT NULL,
  provisional INTEGER NOT NULL DEFAULT 0,
  idempotency_signature TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mailbox_retractions (
  envelope_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  retracted_at_ms INTEGER NOT NULL,
  idempotency_signature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mailbox_sequences (
  conversation_id TEXT PRIMARY KEY,
  last_seq TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_sent ON mailbox_envelopes(sent_at_ms, conversation_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_conversation_seq ON mailbox_envelopes(conversation_id, seq);
CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_expires ON mailbox_envelopes(expires_at_ms);
CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_provisional ON mailbox_envelopes(conversation_type, provisional);
CREATE INDEX IF NOT EXISTS idx_mailbox_retractions_time ON mailbox_retractions(retracted_at_ms DESC);
`;

interface MailboxEnvelopeRow {
  envelopeId: string;
  conversationId: string;
  conversationType: 'direct' | 'group';
  targetDomain: string;
  mailboxKeyId: string;
  sealedHeader: string;
  seq: string;
  epoch: number | null;
  ciphertext: string;
  contentType: 'text' | 'image' | 'file' | 'control';
  attachmentManifestHash: string | null;
  sentAtMs: number;
  ttlSec: number;
  provisional: 0 | 1;
  idempotencySignature: string;
}

interface RetractionRow {
  envelopeId: string;
  conversationId: string;
  reason: 'REORGED_BACK';
  retractedAtMs: number;
}

export class MessageRepository implements MailboxStore {
  private readonly db: Database.Database;
  private readonly nextSequenceTransaction: (conversationId: string) => string;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);

    this.nextSequenceTransaction = this.db.transaction((conversationId: string) => {
      const row = this.db
        .prepare('SELECT last_seq AS lastSeq FROM mailbox_sequences WHERE conversation_id = ?')
        .get(conversationId) as { lastSeq: string } | undefined;

      const nextSeq = row ? BigInt(row.lastSeq) + 1n : 1n;
      this.db
        .prepare(
          `INSERT INTO mailbox_sequences (conversation_id, last_seq)
           VALUES (?, ?)
           ON CONFLICT(conversation_id) DO UPDATE SET
             last_seq = excluded.last_seq`,
        )
        .run(conversationId, nextSeq.toString());

      return nextSeq.toString();
    });
  }

  async nextSequence(conversationId: string): Promise<bigint> {
    return BigInt(this.nextSequenceTransaction(conversationId));
  }

  async saveEnvelope(record: StoredEnvelopeRecord): Promise<void> {
    const envelope = record.envelope;
    const expiresAtMs = envelope.sentAtMs + envelope.ttlSec * 1000;

    this.db
      .prepare(
        `INSERT INTO mailbox_envelopes (
          envelope_id, conversation_id, conversation_type, target_domain, mailbox_key_id,
          sealed_header, seq, epoch, ciphertext, content_type, attachment_manifest_hash,
          sent_at_ms, ttl_sec, provisional, idempotency_signature, expires_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        envelope.envelopeId,
        envelope.conversationId,
        envelope.conversationType,
        envelope.routeHint.targetDomain,
        envelope.routeHint.mailboxKeyId,
        envelope.sealedHeader,
        envelope.seq.toString(),
        envelope.epoch ?? null,
        envelope.ciphertext,
        envelope.contentType,
        envelope.attachmentManifestHash ?? null,
        envelope.sentAtMs,
        envelope.ttlSec,
        envelope.provisional ? 1 : 0,
        record.idempotencySignature,
        expiresAtMs,
      );
  }

  async getEnvelopeRecord(envelopeId: string): Promise<StoredEnvelopeRecord | null> {
    const row = this.db
      .prepare(
        `SELECT
          envelope_id AS envelopeId,
          conversation_id AS conversationId,
          conversation_type AS conversationType,
          target_domain AS targetDomain,
          mailbox_key_id AS mailboxKeyId,
          sealed_header AS sealedHeader,
          seq,
          epoch,
          ciphertext,
          content_type AS contentType,
          attachment_manifest_hash AS attachmentManifestHash,
          sent_at_ms AS sentAtMs,
          ttl_sec AS ttlSec,
          provisional,
          idempotency_signature AS idempotencySignature
        FROM mailbox_envelopes
        WHERE envelope_id = ?`,
      )
      .get(envelopeId) as MailboxEnvelopeRow | undefined;

    if (!row) {
      return null;
    }

    return {
      envelope: this.toEnvelope(row),
      idempotencySignature: row.idempotencySignature,
    };
  }

  async getIdempotencySignature(envelopeId: string): Promise<string | null> {
    const active = this.db
      .prepare(
        `SELECT idempotency_signature AS idempotencySignature
         FROM mailbox_envelopes
         WHERE envelope_id = ?`,
      )
      .get(envelopeId) as { idempotencySignature: string } | undefined;
    if (active) {
      return active.idempotencySignature;
    }

    const retracted = this.db
      .prepare(
        `SELECT idempotency_signature AS idempotencySignature
         FROM mailbox_retractions
         WHERE envelope_id = ?`,
      )
      .get(envelopeId) as { idempotencySignature: string } | undefined;

    return retracted?.idempotencySignature ?? null;
  }

  async getRetraction(envelopeId: string): Promise<ProvisionalRetractionRecord | null> {
    const row = this.db
      .prepare(
        `SELECT
          envelope_id AS envelopeId,
          conversation_id AS conversationId,
          reason,
          retracted_at_ms AS retractedAtMs
        FROM mailbox_retractions
        WHERE envelope_id = ?`,
      )
      .get(envelopeId) as RetractionRow | undefined;

    if (!row) {
      return null;
    }

    return {
      envelopeId: row.envelopeId,
      conversationId: row.conversationId,
      reason: row.reason,
      retractedAtMs: row.retractedAtMs,
    };
  }

  async countEnvelopes(conversationId?: string): Promise<number> {
    const row = conversationId
      ? (this.db
        .prepare(
          `SELECT COUNT(1) AS count
           FROM mailbox_envelopes
           WHERE conversation_id = ?`,
        )
        .get(conversationId) as { count: number })
      : (this.db
        .prepare(
          `SELECT COUNT(1) AS count
           FROM mailbox_envelopes`,
        )
        .get() as { count: number });

    return row.count;
  }

  async listEnvelopes(params: { conversationId?: string; offset: number; limit: number }): Promise<Envelope[]> {
    const rows = params.conversationId
      ? (this.db
        .prepare(
          `SELECT
            envelope_id AS envelopeId,
            conversation_id AS conversationId,
            conversation_type AS conversationType,
            target_domain AS targetDomain,
            mailbox_key_id AS mailboxKeyId,
            sealed_header AS sealedHeader,
            seq,
            epoch,
            ciphertext,
            content_type AS contentType,
            attachment_manifest_hash AS attachmentManifestHash,
            sent_at_ms AS sentAtMs,
            ttl_sec AS ttlSec,
            provisional,
            idempotency_signature AS idempotencySignature
          FROM mailbox_envelopes
          WHERE conversation_id = ?
          ORDER BY CAST(seq AS INTEGER) ASC
          LIMIT ? OFFSET ?`,
        )
        .all(params.conversationId, params.limit, params.offset) as MailboxEnvelopeRow[])
      : (this.db
        .prepare(
          `SELECT
            envelope_id AS envelopeId,
            conversation_id AS conversationId,
            conversation_type AS conversationType,
            target_domain AS targetDomain,
            mailbox_key_id AS mailboxKeyId,
            sealed_header AS sealedHeader,
            seq,
            epoch,
            ciphertext,
            content_type AS contentType,
            attachment_manifest_hash AS attachmentManifestHash,
            sent_at_ms AS sentAtMs,
            ttl_sec AS ttlSec,
            provisional,
            idempotency_signature AS idempotencySignature
          FROM mailbox_envelopes
          ORDER BY sent_at_ms ASC, conversation_id ASC, CAST(seq AS INTEGER) ASC
          LIMIT ? OFFSET ?`,
        )
        .all(params.limit, params.offset) as MailboxEnvelopeRow[]);

    return rows.map((row) => this.toEnvelope(row));
  }

  async listProvisionalGroupRecords(): Promise<StoredEnvelopeRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT
          envelope_id AS envelopeId,
          conversation_id AS conversationId,
          conversation_type AS conversationType,
          target_domain AS targetDomain,
          mailbox_key_id AS mailboxKeyId,
          sealed_header AS sealedHeader,
          seq,
          epoch,
          ciphertext,
          content_type AS contentType,
          attachment_manifest_hash AS attachmentManifestHash,
          sent_at_ms AS sentAtMs,
          ttl_sec AS ttlSec,
          provisional,
          idempotency_signature AS idempotencySignature
        FROM mailbox_envelopes
        WHERE conversation_type = 'group' AND provisional = 1
        ORDER BY sent_at_ms ASC`,
      )
      .all() as MailboxEnvelopeRow[];

    return rows.map((row) => ({
      envelope: this.toEnvelope(row),
      idempotencySignature: row.idempotencySignature,
    }));
  }

  async retractEnvelope(params: {
    envelope: Envelope;
    idempotencySignature: string;
    retractedAtMs: number;
    reason: 'REORGED_BACK';
  }): Promise<void> {
    this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM mailbox_envelopes WHERE envelope_id = ?')
        .run(params.envelope.envelopeId);

      this.db
        .prepare(
          `INSERT INTO mailbox_retractions (
            envelope_id, conversation_id, reason, retracted_at_ms, idempotency_signature
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(envelope_id) DO UPDATE SET
            conversation_id = excluded.conversation_id,
            reason = excluded.reason,
            retracted_at_ms = excluded.retracted_at_ms,
            idempotency_signature = excluded.idempotency_signature`,
        )
        .run(
          params.envelope.envelopeId,
          params.envelope.conversationId,
          params.reason,
          params.retractedAtMs,
          params.idempotencySignature,
        );
    })();
  }

  async listRetractions(limit: number): Promise<ProvisionalRetractionRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT
          envelope_id AS envelopeId,
          conversation_id AS conversationId,
          reason,
          retracted_at_ms AS retractedAtMs
        FROM mailbox_retractions
        ORDER BY retracted_at_ms DESC
        LIMIT ?`,
      )
      .all(Math.max(1, limit)) as RetractionRow[];

    return rows.map((row) => ({
      envelopeId: row.envelopeId,
      conversationId: row.conversationId,
      reason: row.reason,
      retractedAtMs: row.retractedAtMs,
    }));
  }

  async deleteExpired(nowMs: number): Promise<{ removed: number; remaining: number }> {
    const removed = this.db
      .prepare('DELETE FROM mailbox_envelopes WHERE expires_at_ms <= ?')
      .run(nowMs).changes;
    const remaining = (this.db
      .prepare('SELECT COUNT(1) AS count FROM mailbox_envelopes')
      .get() as { count: number }).count;

    return {
      removed,
      remaining,
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private toEnvelope(row: MailboxEnvelopeRow): Envelope {
    return {
      envelopeId: row.envelopeId,
      conversationId: row.conversationId,
      conversationType: row.conversationType,
      routeHint: {
        targetDomain: row.targetDomain,
        mailboxKeyId: row.mailboxKeyId,
      },
      sealedHeader: row.sealedHeader,
      seq: BigInt(row.seq),
      epoch: row.epoch ?? undefined,
      ciphertext: row.ciphertext,
      contentType: row.contentType,
      attachmentManifestHash: row.attachmentManifestHash ?? undefined,
      sentAtMs: row.sentAtMs,
      ttlSec: row.ttlSec,
      provisional: row.provisional === 1,
    };
  }
}
