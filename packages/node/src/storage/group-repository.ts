import Database from 'better-sqlite3';

import type {
  GroupChainState,
  GroupMemberRecord,
  GroupRecord,
  GroupState,
  MembershipState,
} from '@telagent/protocol';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  group_id TEXT PRIMARY KEY,
  creator_did TEXT NOT NULL,
  creator_did_hash TEXT NOT NULL,
  group_domain TEXT NOT NULL,
  domain_proof_hash TEXT NOT NULL,
  initial_mls_state_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  tx_hash TEXT,
  block_number INTEGER
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  did TEXT NOT NULL,
  did_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  joined_at_ms INTEGER NOT NULL,
  invite_id TEXT,
  tx_hash TEXT,
  PRIMARY KEY(group_id, did_hash)
);

CREATE TABLE IF NOT EXISTS group_chain_state (
  group_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  pending_tx_hash TEXT,
  finalized_tx_hash TEXT,
  block_number INTEGER,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  tx_hash TEXT,
  block_number INTEGER,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_events_group_id ON group_events(group_id);
`;

export class GroupRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  saveGroup(record: GroupRecord): void {
    this.db
      .prepare(
        `INSERT INTO groups (
          group_id, creator_did, creator_did_hash, group_domain, domain_proof_hash,
          initial_mls_state_hash, state, created_at_ms, tx_hash, block_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(group_id) DO UPDATE SET
          state = excluded.state,
          tx_hash = excluded.tx_hash,
          block_number = excluded.block_number`,
      )
      .run(
        record.groupId,
        record.creatorDid,
        record.creatorDidHash,
        record.groupDomain,
        record.domainProofHash,
        record.initialMlsStateHash,
        record.state,
        record.createdAtMs,
        record.txHash ?? null,
        record.blockNumber ?? null,
      );
  }

  getGroup(groupId: string): GroupRecord | null {
    const row = this.db
      .prepare(
        `SELECT
          group_id AS groupId,
          creator_did AS creatorDid,
          creator_did_hash AS creatorDidHash,
          group_domain AS groupDomain,
          domain_proof_hash AS domainProofHash,
          initial_mls_state_hash AS initialMlsStateHash,
          state,
          created_at_ms AS createdAtMs,
          tx_hash AS txHash,
          block_number AS blockNumber
        FROM groups
        WHERE group_id = ?`,
      )
      .get(groupId) as GroupRecord | undefined;

    return row ?? null;
  }

  saveMember(record: GroupMemberRecord): void {
    this.db
      .prepare(
        `INSERT INTO group_members (
          group_id, did, did_hash, state, joined_at_ms, invite_id, tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(group_id, did_hash) DO UPDATE SET
          state = excluded.state,
          invite_id = excluded.invite_id,
          tx_hash = excluded.tx_hash`,
      )
      .run(
        record.groupId,
        record.did,
        record.didHash,
        record.state,
        record.joinedAtMs,
        record.inviteId ?? null,
        record.txHash ?? null,
      );
  }

  removeMember(groupId: string, didHash: string): void {
    this.db
      .prepare('DELETE FROM group_members WHERE group_id = ? AND did_hash = ?')
      .run(groupId, didHash);
  }

  listMembers(groupId: string, state?: MembershipState): GroupMemberRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
          group_id AS groupId,
          did,
          did_hash AS didHash,
          state,
          joined_at_ms AS joinedAtMs,
          invite_id AS inviteId,
          tx_hash AS txHash
        FROM group_members
        WHERE group_id = ? ${state ? 'AND state = ?' : ''}
        ORDER BY joined_at_ms ASC`,
      )
      .all(...(state ? [groupId, state] : [groupId])) as GroupMemberRecord[];

    return rows;
  }

  saveChainState(state: GroupChainState): void {
    this.db
      .prepare(
        `INSERT INTO group_chain_state (
          group_id, state, pending_tx_hash, finalized_tx_hash, block_number, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(group_id) DO UPDATE SET
          state = excluded.state,
          pending_tx_hash = excluded.pending_tx_hash,
          finalized_tx_hash = excluded.finalized_tx_hash,
          block_number = excluded.block_number,
          updated_at_ms = excluded.updated_at_ms`,
      )
      .run(
        state.groupId,
        state.state,
        state.pendingTxHash ?? null,
        state.finalizedTxHash ?? null,
        state.blockNumber ?? null,
        state.updatedAtMs,
      );
  }

  getChainState(groupId: string): GroupChainState | null {
    const row = this.db
      .prepare(
        `SELECT
          group_id AS groupId,
          state,
          pending_tx_hash AS pendingTxHash,
          finalized_tx_hash AS finalizedTxHash,
          block_number AS blockNumber,
          updated_at_ms AS updatedAtMs
        FROM group_chain_state
        WHERE group_id = ?`,
      )
      .get(groupId) as GroupChainState | undefined;

    return row ?? null;
  }

  recordEvent(params: {
    groupId: string;
    eventName: string;
    txHash?: string;
    blockNumber?: number;
    payload: Record<string, unknown>;
  }): void {
    this.db
      .prepare(
        `INSERT INTO group_events (
          group_id, event_name, tx_hash, block_number, payload_json, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.groupId,
        params.eventName,
        params.txHash ?? null,
        params.blockNumber ?? null,
        JSON.stringify(params.payload),
        Date.now(),
      );
  }

  listEvents(groupId: string): Array<{ eventName: string; txHash: string | null; blockNumber: number | null; payload: Record<string, unknown> }> {
    const rows = this.db
      .prepare(
        `SELECT event_name AS eventName, tx_hash AS txHash, block_number AS blockNumber, payload_json AS payloadJson
         FROM group_events
         WHERE group_id = ?
         ORDER BY id ASC`,
      )
      .all(groupId) as Array<{ eventName: string; txHash: string | null; blockNumber: number | null; payloadJson: string }>;

    return rows.map((row) => ({
      eventName: row.eventName,
      txHash: row.txHash,
      blockNumber: row.blockNumber,
      payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    }));
  }

  updateGroupState(groupId: string, state: GroupState, txHash?: string, blockNumber?: number): void {
    this.db
      .prepare(
        `UPDATE groups
         SET state = ?, tx_hash = COALESCE(?, tx_hash), block_number = COALESCE(?, block_number)
         WHERE group_id = ?`,
      )
      .run(state, txHash ?? null, blockNumber ?? null, groupId);
  }
}
