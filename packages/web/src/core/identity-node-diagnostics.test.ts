import { describe, expect, it } from 'vitest';

import {
  buildDidDiagnostics,
  buildNodeRuntimeDiagnostics,
  hashDidKeccakUtf8,
} from './identity-node-diagnostics';

describe('identity-node-diagnostics', () => {
  it('hashDidKeccakUtf8 follows keccak256(utf8(did))', () => {
    expect(hashDidKeccakUtf8('did:claw:zAlice')).toBe('0x9c57cdb3e51422595c9771ab235621af55dfa07f51e0fd4639bb3fb9a5183b4d');
  });

  it('buildDidDiagnostics parses DID and compares remote hash', () => {
    const diagnostics = buildDidDiagnostics(' did:claw:zAlice ', '0x9c57cdb3e51422595c9771ab235621af55dfa07f51e0fd4639bb3fb9a5183b4d');
    expect(diagnostics.normalizedDid).toBe('did:claw:zAlice');
    expect(diagnostics.isValidDid).toBe(true);
    expect(diagnostics.method).toBe('claw');
    expect(diagnostics.identifier).toBe('zAlice');
    expect(diagnostics.hashMatchesRemote).toBe(true);
  });

  it('buildDidDiagnostics marks invalid DID and does not emit hash', () => {
    const diagnostics = buildDidDiagnostics('did:key:zAlice');
    expect(diagnostics.isValidDid).toBe(false);
    expect(diagnostics.didHash).toBeNull();
    expect(diagnostics.hashMatchesRemote).toBeNull();
  });

  it('buildNodeRuntimeDiagnostics computes level from alerts', () => {
    const warn = buildNodeRuntimeDiagnostics(
      { service: 'telagent-node', version: '0.1.0' },
      {
        generatedAt: '2026-03-03T00:00:00.000Z',
        uptimeSec: 120,
        totals: {
          requests: 10,
          errorRateRatio: 0,
          p95LatencyMs: 50,
        },
        mailboxMaintenance: {
          staleSec: 30,
        },
        federationDlqReplay: {
          burnRate: 1,
        },
        alerts: [{ level: 'WARN' }],
      },
    );
    expect(warn.level).toBe('WARN');
    expect(warn.alertCounts.warn).toBe(1);

    const critical = buildNodeRuntimeDiagnostics(
      { service: 'telagent-node', version: '0.1.0' },
      {
        generatedAt: '2026-03-03T00:00:00.000Z',
        uptimeSec: 120,
        totals: {
          requests: 10,
          errorRateRatio: 0.3,
          p95LatencyMs: 900,
        },
        mailboxMaintenance: {
          staleSec: 330,
        },
        federationDlqReplay: {
          burnRate: 9,
        },
        alerts: [{ level: 'WARN' }, { level: 'CRITICAL' }],
      },
    );
    expect(critical.level).toBe('CRITICAL');
    expect(critical.alertCounts.total).toBe(2);
    expect(critical.alertCounts.critical).toBe(1);
  });
});
