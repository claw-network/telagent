import { Pool, type PoolClient } from 'pg';

import type { Envelope } from '@telagent/protocol';

import type {
  MailboxStore,
  ProvisionalRetractionRecord,
  StoredEnvelopeRecord,
} from './mailbox-store.js';

export interface PostgresMessageRepositoryOptions {
  connectionString: string;
  schema?: string;
  maxConnections?: number;
  ssl?: boolean;
}

interface MailboxEnvelopeRow {
  envelope_id: string;
  conversation_id: string;
  conversation_type: 'direct' | 'group';
  target_domain: string;
  mailbox_key_id: string;
  sealed_header: string;
  seq: string;
  epoch: number | null;
  ciphertext: string;
  content_type: 'text' | 'image' | 'file' | 'control';
  attachment_manifest_hash: string | null;
  sent_at_ms: string;
  ttl_sec: number;
  provisional: boolean;
  idempotency_signature: string;
}

interface RetractionRow {
  envelope_id: string;
  conversation_id: string;
  reason: 'REORGED_BACK';
  retracted_at_ms: string;
}

function assertSchemaName(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`invalid postgres schema name: ${value}`);
  }
  return value;
}

export class PostgresMessageRepository implements MailboxStore {
  private readonly pool: Pool;
  private readonly schema: string;

  constructor(options: PostgresMessageRepositoryOptions) {
    this.schema = assertSchemaName(options.schema ?? 'public');
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: options.maxConnections ?? 10,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async init(): Promise<void> {
    const schemaName = this.schema;
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table('mailbox_envelopes')} (
        envelope_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        conversation_type TEXT NOT NULL,
        target_domain TEXT NOT NULL,
        mailbox_key_id TEXT NOT NULL,
        sealed_header TEXT NOT NULL,
        seq BIGINT NOT NULL,
        epoch INTEGER,
        ciphertext TEXT NOT NULL,
        content_type TEXT NOT NULL,
        attachment_manifest_hash TEXT,
        sent_at_ms BIGINT NOT NULL,
        ttl_sec INTEGER NOT NULL,
        provisional BOOLEAN NOT NULL DEFAULT FALSE,
        idempotency_signature TEXT NOT NULL,
        expires_at_ms BIGINT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table('mailbox_retractions')} (
        envelope_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        retracted_at_ms BIGINT NOT NULL,
        idempotency_signature TEXT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table('mailbox_sequences')} (
        conversation_id TEXT PRIMARY KEY,
        last_seq BIGINT NOT NULL
      )
    `);

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_sent ON ${this.table('mailbox_envelopes')}(sent_at_ms, conversation_id)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_conversation_seq ON ${this.table('mailbox_envelopes')}(conversation_id, seq)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_pull_cursor ON ${this.table('mailbox_envelopes')}(sent_at_ms, conversation_id, seq, envelope_id)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_expires ON ${this.table('mailbox_envelopes')}(expires_at_ms)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mailbox_envelopes_provisional ON ${this.table('mailbox_envelopes')}(conversation_type, provisional)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mailbox_retractions_time ON ${this.table('mailbox_retractions')}(retracted_at_ms DESC)`,
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async nextSequence(conversationId: string): Promise<bigint> {
    const result = await this.pool.query<{ last_seq: string }>(
      `INSERT INTO ${this.table('mailbox_sequences')} (conversation_id, last_seq)
       VALUES ($1, 1)
       ON CONFLICT(conversation_id) DO UPDATE SET
         last_seq = ${this.table('mailbox_sequences')}.last_seq + 1
       RETURNING last_seq::text AS last_seq`,
      [conversationId],
    );

    if (!result.rowCount || !result.rows[0]) {
      throw new Error(`failed to allocate sequence for conversation(${conversationId})`);
    }
    return BigInt(result.rows[0].last_seq);
  }

  async saveEnvelope(record: StoredEnvelopeRecord): Promise<void> {
    const envelope = record.envelope;
    const expiresAtMs = envelope.sentAtMs + envelope.ttlSec * 1000;

    await this.pool.query(
      `INSERT INTO ${this.table('mailbox_envelopes')} (
        envelope_id, conversation_id, conversation_type, target_domain, mailbox_key_id,
        sealed_header, seq, epoch, ciphertext, content_type, attachment_manifest_hash,
        sent_at_ms, ttl_sec, provisional, idempotency_signature, expires_at_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
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
        envelope.provisional ?? false,
        record.idempotencySignature,
        expiresAtMs,
      ],
    );
  }

  async getEnvelopeRecord(envelopeId: string): Promise<StoredEnvelopeRecord | null> {
    const result = await this.pool.query<MailboxEnvelopeRow>(
      `SELECT
         envelope_id,
         conversation_id,
         conversation_type,
         target_domain,
         mailbox_key_id,
         sealed_header,
         seq::text AS seq,
         epoch,
         ciphertext,
         content_type,
         attachment_manifest_hash,
         sent_at_ms::text AS sent_at_ms,
         ttl_sec,
         provisional,
         idempotency_signature
       FROM ${this.table('mailbox_envelopes')}
       WHERE envelope_id = $1`,
      [envelopeId],
    );

    if (!result.rowCount || !result.rows[0]) {
      return null;
    }

    const row = result.rows[0];
    return {
      envelope: this.toEnvelope(row),
      idempotencySignature: row.idempotency_signature,
    };
  }

  async getIdempotencySignature(envelopeId: string): Promise<string | null> {
    const active = await this.pool.query<{ idempotency_signature: string }>(
      `SELECT idempotency_signature
       FROM ${this.table('mailbox_envelopes')}
       WHERE envelope_id = $1`,
      [envelopeId],
    );
    if (active.rowCount && active.rows[0]) {
      return active.rows[0].idempotency_signature;
    }

    const retracted = await this.pool.query<{ idempotency_signature: string }>(
      `SELECT idempotency_signature
       FROM ${this.table('mailbox_retractions')}
       WHERE envelope_id = $1`,
      [envelopeId],
    );
    if (retracted.rowCount && retracted.rows[0]) {
      return retracted.rows[0].idempotency_signature;
    }
    return null;
  }

  async getRetraction(envelopeId: string): Promise<ProvisionalRetractionRecord | null> {
    const result = await this.pool.query<RetractionRow>(
      `SELECT
         envelope_id,
         conversation_id,
         reason,
         retracted_at_ms::text AS retracted_at_ms
       FROM ${this.table('mailbox_retractions')}
       WHERE envelope_id = $1`,
      [envelopeId],
    );

    if (!result.rowCount || !result.rows[0]) {
      return null;
    }
    const row = result.rows[0];
    return {
      envelopeId: row.envelope_id,
      conversationId: row.conversation_id,
      reason: row.reason,
      retractedAtMs: Number.parseInt(row.retracted_at_ms, 10),
    };
  }

  async countEnvelopes(conversationId?: string): Promise<number> {
    const result = conversationId
      ? await this.pool.query<{ count: string }>(
        `SELECT COUNT(1)::text AS count
         FROM ${this.table('mailbox_envelopes')}
         WHERE conversation_id = $1`,
        [conversationId],
      )
      : await this.pool.query<{ count: string }>(
        `SELECT COUNT(1)::text AS count
         FROM ${this.table('mailbox_envelopes')}`,
      );

    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async listEnvelopes(params: {
    conversationId?: string;
    limit: number;
    afterSeq?: bigint;
    afterKey?: { sentAtMs: number; conversationId: string; seq: bigint; envelopeId: string };
  }): Promise<Envelope[]> {
    const result = params.conversationId
      ? typeof params.afterSeq !== 'undefined'
        ? await this.pool.query<MailboxEnvelopeRow>(
          `SELECT
             envelope_id,
             conversation_id,
             conversation_type,
             target_domain,
             mailbox_key_id,
             sealed_header,
             seq::text AS seq,
             epoch,
             ciphertext,
             content_type,
             attachment_manifest_hash,
             sent_at_ms::text AS sent_at_ms,
             ttl_sec,
             provisional,
             idempotency_signature
           FROM ${this.table('mailbox_envelopes')}
           WHERE conversation_id = $1 AND seq > $2
           ORDER BY seq ASC, envelope_id ASC
           LIMIT $3`,
          [params.conversationId, params.afterSeq.toString(), params.limit],
        )
        : await this.pool.query<MailboxEnvelopeRow>(
          `SELECT
             envelope_id,
             conversation_id,
             conversation_type,
             target_domain,
             mailbox_key_id,
             sealed_header,
             seq::text AS seq,
             epoch,
             ciphertext,
             content_type,
             attachment_manifest_hash,
             sent_at_ms::text AS sent_at_ms,
             ttl_sec,
             provisional,
             idempotency_signature
           FROM ${this.table('mailbox_envelopes')}
           WHERE conversation_id = $1
           ORDER BY seq ASC, envelope_id ASC
           LIMIT $2`,
          [params.conversationId, params.limit],
        )
      : params.afterKey
        ? await this.pool.query<MailboxEnvelopeRow>(
          `SELECT
             envelope_id,
             conversation_id,
             conversation_type,
             target_domain,
             mailbox_key_id,
             sealed_header,
             seq::text AS seq,
             epoch,
             ciphertext,
             content_type,
             attachment_manifest_hash,
             sent_at_ms::text AS sent_at_ms,
             ttl_sec,
             provisional,
             idempotency_signature
           FROM ${this.table('mailbox_envelopes')}
           WHERE (sent_at_ms, conversation_id, seq, envelope_id) > ($1, $2, $3, $4)
           ORDER BY sent_at_ms ASC, conversation_id ASC, seq ASC, envelope_id ASC
           LIMIT $5`,
          [
            params.afterKey.sentAtMs,
            params.afterKey.conversationId,
            params.afterKey.seq.toString(),
            params.afterKey.envelopeId,
            params.limit,
          ],
        )
        : await this.pool.query<MailboxEnvelopeRow>(
          `SELECT
             envelope_id,
             conversation_id,
             conversation_type,
             target_domain,
             mailbox_key_id,
             sealed_header,
             seq::text AS seq,
             epoch,
             ciphertext,
             content_type,
             attachment_manifest_hash,
             sent_at_ms::text AS sent_at_ms,
             ttl_sec,
             provisional,
             idempotency_signature
           FROM ${this.table('mailbox_envelopes')}
           ORDER BY sent_at_ms ASC, conversation_id ASC, seq ASC, envelope_id ASC
           LIMIT $1`,
          [params.limit],
        );

    return result.rows.map((row) => this.toEnvelope(row));
  }

  async listProvisionalGroupRecords(): Promise<StoredEnvelopeRecord[]> {
    const result = await this.pool.query<MailboxEnvelopeRow>(
      `SELECT
         envelope_id,
         conversation_id,
         conversation_type,
         target_domain,
         mailbox_key_id,
         sealed_header,
         seq::text AS seq,
         epoch,
         ciphertext,
         content_type,
         attachment_manifest_hash,
         sent_at_ms::text AS sent_at_ms,
         ttl_sec,
         provisional,
         idempotency_signature
       FROM ${this.table('mailbox_envelopes')}
       WHERE conversation_type = 'group' AND provisional = TRUE
       ORDER BY sent_at_ms ASC`,
    );

    return result.rows.map((row) => ({
      envelope: this.toEnvelope(row),
      idempotencySignature: row.idempotency_signature,
    }));
  }

  async retractEnvelope(params: {
    envelope: Envelope;
    idempotencySignature: string;
    retractedAtMs: number;
    reason: 'REORGED_BACK';
  }): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query(
        `DELETE FROM ${this.table('mailbox_envelopes')}
         WHERE envelope_id = $1`,
        [params.envelope.envelopeId],
      );

      await client.query(
        `INSERT INTO ${this.table('mailbox_retractions')} (
          envelope_id, conversation_id, reason, retracted_at_ms, idempotency_signature
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(envelope_id) DO UPDATE SET
          conversation_id = EXCLUDED.conversation_id,
          reason = EXCLUDED.reason,
          retracted_at_ms = EXCLUDED.retracted_at_ms,
          idempotency_signature = EXCLUDED.idempotency_signature`,
        [
          params.envelope.envelopeId,
          params.envelope.conversationId,
          params.reason,
          params.retractedAtMs,
          params.idempotencySignature,
        ],
      );
    });
  }

  async listRetractions(limit: number): Promise<ProvisionalRetractionRecord[]> {
    const result = await this.pool.query<RetractionRow>(
      `SELECT
         envelope_id,
         conversation_id,
         reason,
         retracted_at_ms::text AS retracted_at_ms
       FROM ${this.table('mailbox_retractions')}
       ORDER BY retracted_at_ms DESC
       LIMIT $1`,
      [Math.max(1, limit)],
    );

    return result.rows.map((row) => ({
      envelopeId: row.envelope_id,
      conversationId: row.conversation_id,
      reason: row.reason,
      retractedAtMs: Number.parseInt(row.retracted_at_ms, 10),
    }));
  }

  async deleteExpired(nowMs: number): Promise<{ removed: number; remaining: number }> {
    const removed = await this.pool.query(
      `DELETE FROM ${this.table('mailbox_envelopes')}
       WHERE expires_at_ms <= $1`,
      [nowMs],
    );
    const remaining = await this.pool.query<{ count: string }>(
      `SELECT COUNT(1)::text AS count
       FROM ${this.table('mailbox_envelopes')}`,
    );

    return {
      removed: removed.rowCount ?? 0,
      remaining: Number.parseInt(remaining.rows[0]?.count ?? '0', 10),
    };
  }

  private toEnvelope(row: MailboxEnvelopeRow): Envelope {
    return {
      envelopeId: row.envelope_id,
      conversationId: row.conversation_id,
      conversationType: row.conversation_type,
      routeHint: {
        targetDomain: row.target_domain,
        mailboxKeyId: row.mailbox_key_id,
      },
      sealedHeader: row.sealed_header,
      seq: BigInt(row.seq),
      epoch: row.epoch ?? undefined,
      ciphertext: row.ciphertext,
      contentType: row.content_type,
      attachmentManifestHash: row.attachment_manifest_hash ?? undefined,
      sentAtMs: Number.parseInt(row.sent_at_ms, 10),
      ttlSec: row.ttl_sec,
      provisional: row.provisional,
    };
  }

  private async withTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private table(name: string): string {
    return `"${this.schema}"."${name}"`;
  }
}
