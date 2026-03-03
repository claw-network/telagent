export function createSessionRuntime() {
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

export function ensureSessionRuntime(runtimeMap, conversationId) {
  const key = String(conversationId || '').trim();
  if (!key) {
    return createSessionRuntime();
  }
  const existing = runtimeMap.get(key);
  if (existing) {
    return existing;
  }
  const created = createSessionRuntime();
  runtimeMap.set(key, created);
  return created;
}

export function mergeMessagesByEnvelope(existingItems, incomingItems) {
  const map = new Map();

  for (const item of Array.isArray(existingItems) ? existingItems : []) {
    if (item && typeof item.envelopeId === 'string') {
      map.set(item.envelopeId, item);
    }
  }

  for (const item of Array.isArray(incomingItems) ? incomingItems : []) {
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

    return String(left?.envelopeId || '').localeCompare(String(right?.envelopeId || ''));
  });
}

export function recordPullSuccess(runtime, { cursor, loadedCount, action }) {
  runtime.cursor = typeof cursor === 'string' && cursor.trim() ? cursor : undefined;
  runtime.lastPullAt = new Date().toISOString();
  runtime.lastPullCount = Number.isInteger(loadedCount) ? loadedCount : 0;
  runtime.pullFailures = 0;
  runtime.lastPullError = null;
  runtime.lastAction = typeof action === 'string' ? action : 'pull';
  return runtime;
}

export function recordPullFailure(runtime, errorMessage) {
  runtime.pullFailures += 1;
  runtime.lastPullError = String(errorMessage || 'pull failed');
  runtime.lastAction = 'pull:failed';
  return runtime;
}

export function resetPullCursor(runtime) {
  runtime.cursor = undefined;
  runtime.lastAction = 'pull:reset-cursor';
  return runtime;
}

export function recordSendSuccess(runtime, envelopeId) {
  runtime.lastSendAt = new Date().toISOString();
  runtime.sendFailures = 0;
  runtime.lastSendError = null;
  runtime.lastFailedEnvelope = null;
  runtime.lastSentEnvelopeId = String(envelopeId || '');
  runtime.lastAction = 'send';
  return runtime;
}

export function recordSendFailure(runtime, errorMessage, payload) {
  runtime.sendFailures += 1;
  runtime.lastSendError = String(errorMessage || 'send failed');
  runtime.lastFailedEnvelope = payload && typeof payload === 'object' ? { ...payload } : null;
  runtime.lastAction = 'send:failed';
  return runtime;
}

export function formatIsoOrDash(isoText) {
  if (!isoText || typeof isoText !== 'string') {
    return '-';
  }
  const date = new Date(isoText);
  if (Number.isNaN(date.valueOf())) {
    return '-';
  }
  return date.toISOString();
}
