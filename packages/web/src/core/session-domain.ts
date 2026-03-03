export interface SessionRuntime {
  cursor?: string;
  lastPullAt: string | null;
  lastPullCount: number;
  pullFailures: number;
  lastPullError: string | null;
  lastAction: string | null;
  lastSendAt: string | null;
  sendFailures: number;
  lastSendError: string | null;
  lastFailedEnvelope: Record<string, unknown> | null;
  lastSentEnvelopeId: string | null;
}

export interface MessageLike {
  envelopeId?: string;
  seq?: number;
  sentAtMs?: number;
  [key: string]: unknown;
}

export function createSessionRuntime(): SessionRuntime {
  return {
    cursor: undefined,
    lastPullAt: null,
    lastPullCount: 0,
    pullFailures: 0,
    lastPullError: null,
    lastAction: null,
    lastSendAt: null,
    sendFailures: 0,
    lastSendError: null,
    lastFailedEnvelope: null,
    lastSentEnvelopeId: null,
  };
}

export function mergeMessagesByEnvelope(existingItems: MessageLike[], incomingItems: MessageLike[]): MessageLike[] {
  const map = new Map<string, MessageLike>();

  for (const item of existingItems) {
    if (item && typeof item.envelopeId === 'string') {
      map.set(item.envelopeId, item);
    }
  }

  for (const item of incomingItems) {
    if (item && typeof item.envelopeId === 'string') {
      map.set(item.envelopeId, item);
    }
  }

  return [...map.values()].sort((left, right) => {
    const leftSeq = Number(left?.seq ?? 0);
    const rightSeq = Number(right?.seq ?? 0);
    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }

    const leftTime = Number(left?.sentAtMs ?? 0);
    const rightTime = Number(right?.sentAtMs ?? 0);
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return String(left?.envelopeId ?? '').localeCompare(String(right?.envelopeId ?? ''));
  });
}

export function recordPullSuccess(runtime: SessionRuntime, options: { cursor?: string; loadedCount: number; action: string }): SessionRuntime {
  runtime.cursor = typeof options.cursor === 'string' && options.cursor.trim() ? options.cursor : undefined;
  runtime.lastPullAt = new Date().toISOString();
  runtime.lastPullCount = Number.isInteger(options.loadedCount) ? options.loadedCount : 0;
  runtime.pullFailures = 0;
  runtime.lastPullError = null;
  runtime.lastAction = options.action;
  return runtime;
}

export function recordPullFailure(runtime: SessionRuntime, errorMessage: string): SessionRuntime {
  runtime.pullFailures += 1;
  runtime.lastPullError = String(errorMessage || 'pull failed');
  runtime.lastAction = 'pull:failed';
  return runtime;
}

export function resetPullCursor(runtime: SessionRuntime): SessionRuntime {
  runtime.cursor = undefined;
  runtime.lastAction = 'pull:reset-cursor';
  return runtime;
}

export function recordSendSuccess(runtime: SessionRuntime, envelopeId: string): SessionRuntime {
  runtime.lastSendAt = new Date().toISOString();
  runtime.sendFailures = 0;
  runtime.lastSendError = null;
  runtime.lastFailedEnvelope = null;
  runtime.lastSentEnvelopeId = envelopeId;
  runtime.lastAction = 'send';
  return runtime;
}

export function recordSendFailure(runtime: SessionRuntime, errorMessage: string, payload: Record<string, unknown>): SessionRuntime {
  runtime.sendFailures += 1;
  runtime.lastSendError = String(errorMessage || 'send failed');
  runtime.lastFailedEnvelope = { ...payload };
  runtime.lastAction = 'send:failed';
  return runtime;
}

export function formatIsoOrDash(isoText: string | null): string {
  if (!isoText || typeof isoText !== 'string') {
    return '-';
  }
  const date = new Date(isoText);
  if (Number.isNaN(date.valueOf())) {
    return '-';
  }
  return date.toISOString();
}
