import type { HealthAssessment } from './types';

export interface HealthSignalInput {
  endpointFailures: number;
  criticalAlerts: number;
  warnAlerts: number;
  errorRateRatio: number;
  p95LatencyMs: number;
  dlqPending: number;
  mailboxStaleSec: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function assessHealth(input: HealthSignalInput): HealthAssessment {
  const endpointFailures = Math.max(0, Math.floor(finiteOrZero(input.endpointFailures)));
  const criticalAlerts = Math.max(0, Math.floor(finiteOrZero(input.criticalAlerts)));
  const warnAlerts = Math.max(0, Math.floor(finiteOrZero(input.warnAlerts)));
  const errorRateRatio = Math.max(0, finiteOrZero(input.errorRateRatio));
  const p95LatencyMs = Math.max(0, finiteOrZero(input.p95LatencyMs));
  const dlqPending = Math.max(0, Math.floor(finiteOrZero(input.dlqPending)));
  const mailboxStaleSec = Math.max(0, finiteOrZero(input.mailboxStaleSec));

  const reasons: string[] = [];
  let penalty = 0;

  if (endpointFailures > 0) {
    penalty += endpointFailures * 25;
    reasons.push(`${endpointFailures} 个监控接口不可用`);
  }

  if (criticalAlerts > 0) {
    penalty += criticalAlerts * 30;
    reasons.push(`存在 ${criticalAlerts} 个 CRITICAL 告警`);
  }

  if (warnAlerts > 0) {
    penalty += warnAlerts * 8;
    reasons.push(`存在 ${warnAlerts} 个 WARN 告警`);
  }

  if (errorRateRatio >= 0.05) {
    penalty += 20;
    reasons.push(`5xx 错误率过高 (${formatPercent(errorRateRatio)})`);
  } else if (errorRateRatio >= 0.02) {
    penalty += 10;
    reasons.push(`5xx 错误率偏高 (${formatPercent(errorRateRatio)})`);
  }

  if (p95LatencyMs >= 500) {
    penalty += 18;
    reasons.push(`P95 延迟过高 (${formatMs(p95LatencyMs)})`);
  } else if (p95LatencyMs >= 250) {
    penalty += 9;
    reasons.push(`P95 延迟偏高 (${formatMs(p95LatencyMs)})`);
  }

  if (dlqPending > 0) {
    penalty += Math.min(24, 5 + dlqPending);
    reasons.push(`DLQ 待回放 ${dlqPending}`);
  }

  if (mailboxStaleSec >= 300) {
    penalty += 16;
    reasons.push(`Mailbox 维护滞后 ${Math.floor(mailboxStaleSec)} 秒`);
  } else if (mailboxStaleSec >= 180) {
    penalty += 8;
    reasons.push(`Mailbox 维护变慢 ${Math.floor(mailboxStaleSec)} 秒`);
  }

  if (reasons.length === 0) {
    reasons.push('关键指标正常');
  }

  const score = clamp(Math.round(100 - penalty), 0, 100);

  if (endpointFailures >= 3 || score < 20) {
    return {
      level: 'offline',
      score,
      reasons,
    };
  }

  if (
    endpointFailures > 0
    || criticalAlerts > 0
    || warnAlerts > 0
    || dlqPending > 0
    || errorRateRatio >= 0.02
    || p95LatencyMs >= 250
    || mailboxStaleSec >= 180
  ) {
    return {
      level: 'degraded',
      score,
      reasons,
    };
  }

  return {
    level: 'healthy',
    score,
    reasons,
  };
}

const INTEGER = new Intl.NumberFormat('en-US');

export function formatCount(value: number): string {
  const safe = finiteOrZero(value);
  return INTEGER.format(Math.round(safe));
}

export function formatPercent(ratio: number, digits = 2): string {
  const safeRatio = Math.max(0, finiteOrZero(ratio));
  return `${(safeRatio * 100).toFixed(digits)}%`;
}

export function formatMs(value: number): string {
  const safe = Math.max(0, finiteOrZero(value));
  if (safe < 1000) {
    return `${safe.toFixed(safe < 100 ? 1 : 0)}ms`;
  }
  return `${(safe / 1000).toFixed(2)}s`;
}

export function formatUptime(totalSec: number): string {
  const safe = Math.max(0, Math.floor(finiteOrZero(totalSec)));
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatAgo(isoTime: string | null | undefined, nowMs = Date.now()): string {
  if (!isoTime) {
    return 'n/a';
  }

  const timestamp = Date.parse(isoTime);
  if (!Number.isFinite(timestamp)) {
    return 'n/a';
  }

  const deltaSec = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (deltaSec < 60) {
    return `${deltaSec}s ago`;
  }

  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) {
    return `${deltaMin}m ago`;
  }

  const deltaHour = Math.floor(deltaMin / 60);
  if (deltaHour < 24) {
    return `${deltaHour}h ago`;
  }

  const deltaDay = Math.floor(deltaHour / 24);
  return `${deltaDay}d ago`;
}

export function truncateDid(value: string | null | undefined, head = 14, tail = 8): string {
  if (!value) {
    return '-';
  }

  if (value.length <= head + tail + 3) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
