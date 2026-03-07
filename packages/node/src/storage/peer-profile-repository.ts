import Database from 'better-sqlite3';

import type { AgentDID, PeerProfile } from '@telagent/protocol';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS peer_profiles (
  did TEXT PRIMARY KEY,
  nickname TEXT,
  avatar_url TEXT,
  node_url TEXT,
  received_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
`;

interface PeerProfileRow {
  did: string;
  nickname: string | null;
  avatar_url: string | null;
  node_url: string | null;
  received_at_ms: number;
  updated_at_ms: number;
}

function toProfile(row: PeerProfileRow): PeerProfile {
  return {
    did: row.did,
    nickname: row.nickname ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    nodeUrl: row.node_url ?? undefined,
    receivedAtMs: row.received_at_ms,
  };
}

export class PeerProfileRepository {
  private readonly db: InstanceType<typeof Database>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  upsert(profile: PeerProfile): void {
    const nowMs = Date.now();
    this.db
      .prepare(
        `INSERT INTO peer_profiles (did, nickname, avatar_url, node_url, received_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(did) DO UPDATE SET
           nickname = excluded.nickname,
           avatar_url = excluded.avatar_url,
           node_url = excluded.node_url,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run(
        profile.did,
        profile.nickname ?? null,
        profile.avatarUrl ?? null,
        profile.nodeUrl ?? null,
        profile.receivedAtMs,
        nowMs,
      );
  }

  get(did: AgentDID): PeerProfile | null {
    const row = this.db
      .prepare(
        'SELECT did, nickname, avatar_url, node_url, received_at_ms, updated_at_ms FROM peer_profiles WHERE did = ?',
      )
      .get(did) as PeerProfileRow | undefined;
    return row ? toProfile(row) : null;
  }

  close(): void {
    this.db.close();
  }
}
