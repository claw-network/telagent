import { describe, expect, it } from 'vitest';

import { assessHealth, formatPercent, formatUptime } from './format';

describe('format helpers', () => {
  it('formats percentages', () => {
    expect(formatPercent(0.01234)).toBe('1.23%');
  });

  it('formats uptime output', () => {
    expect(formatUptime(3661)).toBe('1h 1m');
  });
});

describe('assessHealth', () => {
  it('returns healthy when all signals are normal', () => {
    const result = assessHealth({
      endpointFailures: 0,
      criticalAlerts: 0,
      warnAlerts: 0,
      errorRateRatio: 0,
      p95LatencyMs: 120,
      dlqPending: 0,
      mailboxStaleSec: 20,
    });

    expect(result.level).toBe('healthy');
    expect(result.score).toBe(100);
  });

  it('returns degraded when warn/latency signals appear', () => {
    const result = assessHealth({
      endpointFailures: 0,
      criticalAlerts: 0,
      warnAlerts: 1,
      errorRateRatio: 0,
      p95LatencyMs: 330,
      dlqPending: 0,
      mailboxStaleSec: 20,
    });

    expect(result.level).toBe('degraded');
    expect(result.score).toBeLessThan(100);
  });

  it('returns offline when endpoint failures are severe', () => {
    const result = assessHealth({
      endpointFailures: 4,
      criticalAlerts: 0,
      warnAlerts: 0,
      errorRateRatio: 0,
      p95LatencyMs: 50,
      dlqPending: 0,
      mailboxStaleSec: 0,
    });

    expect(result.level).toBe('offline');
    expect(result.score).toBe(0);
  });
});
