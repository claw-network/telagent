import { type Envelope } from '@telagent/protocol';

import type {
  FederationOutboxFailureUpdate,
  FederationOutboxRecord,
  MailboxStore,
} from '../storage/mailbox-store.js';
import { domainBaseUrl, normalizeFederationDomain } from './sequencer-domain.js';

interface PendingDelivery {
  key: string;
  envelope: Envelope;
  targetDomain: string;
  attemptCount: number;
  nextRetryAtMs: number;
  lastError?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
}

interface FederationDeliveryOutboxStore {
  enqueueFederationOutbox(entry: {
    key: string;
    envelope: Envelope;
    targetDomain: string;
    nextRetryAtMs: number;
    createdAtMs: number;
  }): Promise<boolean>;
  listDueFederationOutbox(params: {
    nowMs: number;
    limit: number;
  }): Promise<FederationOutboxRecord[]>;
  updateFederationOutboxFailure(update: FederationOutboxFailureUpdate): Promise<void>;
  deleteFederationOutbox(key: string): Promise<void>;
  countFederationOutbox?(): Promise<number>;
}

export interface FederationDeliveryClock {
  now(): number;
}

export interface FederationDeliveryServiceOptions {
  selfDomain: string;
  authToken?: string;
  protocolVersion?: string;
  requestTimeoutMs?: number;
  loopIntervalMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  maxAttempts?: number;
  flushBatchSize?: number;
  fetchImpl?: typeof fetch;
  store?: MailboxStore;
  clock?: FederationDeliveryClock;
}

const DEFAULT_PROTOCOL_VERSION = 'v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_LOOP_INTERVAL_MS = 1_000;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_RETRY_MAX_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_FLUSH_BATCH_SIZE = 100;

const SYSTEM_CLOCK: FederationDeliveryClock = {
  now: () => Date.now(),
};

export class FederationDeliveryService {
  private readonly selfDomain: string;
  private readonly authToken?: string;
  private readonly protocolVersion: string;
  private readonly requestTimeoutMs: number;
  private readonly loopIntervalMs: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly maxAttempts: number;
  private readonly flushBatchSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly outboxStore?: FederationDeliveryOutboxStore;
  private readonly clock: FederationDeliveryClock;
  private readonly pendingByKey = new Map<string, PendingDelivery>();
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(options: FederationDeliveryServiceOptions) {
    this.selfDomain = normalizeFederationDomain(options.selfDomain, 'selfDomain');
    this.authToken = options.authToken?.trim() || undefined;
    this.protocolVersion = options.protocolVersion?.trim().toLowerCase() || DEFAULT_PROTOCOL_VERSION;
    this.requestTimeoutMs = Math.max(1_000, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.loopIntervalMs = Math.max(250, options.loopIntervalMs ?? DEFAULT_LOOP_INTERVAL_MS);
    this.retryBaseMs = Math.max(100, options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS);
    this.retryMaxMs = Math.max(this.retryBaseMs, options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.flushBatchSize = Math.max(1, options.flushBatchSize ?? DEFAULT_FLUSH_BATCH_SIZE);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.outboxStore = resolveOutboxStore(options.store);
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.flushOnce().catch(() => {
        // keep replay loop alive on transient failures
      });
    }, this.loopIntervalMs);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  async enqueue(envelope: Envelope): Promise<boolean> {
    const targetDomain = normalizeFederationDomain(envelope.routeHint.targetDomain, 'targetDomain');
    if (targetDomain === this.selfDomain) {
      return false;
    }

    const key = this.buildKey(envelope.envelopeId, targetDomain);
    const nowMs = this.clock.now();

    if (this.outboxStore) {
      return this.outboxStore.enqueueFederationOutbox({
        key,
        envelope,
        targetDomain,
        nextRetryAtMs: nowMs,
        createdAtMs: nowMs,
      });
    }

    if (this.pendingByKey.has(key)) {
      return false;
    }

    this.pendingByKey.set(key, {
      key,
      envelope,
      targetDomain,
      attemptCount: 0,
      nextRetryAtMs: nowMs,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    });
    return true;
  }

  async flushOnce(): Promise<void> {
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    try {
      const nowMs = this.clock.now();
      const due = await this.listDue(nowMs);

      for (const item of due) {
        await this.deliver(item);
      }
    } finally {
      this.flushing = false;
    }
  }

  async pendingCount(): Promise<number> {
    if (this.outboxStore?.countFederationOutbox) {
      return this.outboxStore.countFederationOutbox();
    }
    return this.pendingByKey.size;
  }

  private async listDue(nowMs: number): Promise<PendingDelivery[]> {
    if (this.outboxStore) {
      return this.outboxStore.listDueFederationOutbox({
        nowMs,
        limit: this.flushBatchSize,
      });
    }

    return [...this.pendingByKey.values()]
      .filter((item) => item.nextRetryAtMs <= nowMs)
      .sort((a, b) => a.nextRetryAtMs - b.nextRetryAtMs)
      .slice(0, this.flushBatchSize);
  }

  private async deliver(item: PendingDelivery): Promise<void> {
    const url = `${domainBaseUrl(item.targetDomain)}/api/v1/federation/envelopes`;
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-telagent-source-domain': this.selfDomain,
          'x-telagent-protocol-version': this.protocolVersion,
          ...(this.authToken ? { 'x-telagent-federation-token': this.authToken } : {}),
        },
        body: JSON.stringify(serializeEnvelope(item.envelope)),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (response.ok) {
        await this.remove(item.key);
        return;
      }

      const detail = await safeResponseSnippet(response);
      const message = `outbound federation request failed (${response.status}): ${detail}`;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        await this.remove(item.key);
        return;
      }
      throw new Error(message);
    } catch (error) {
      const attemptCount = item.attemptCount + 1;
      if (attemptCount >= this.maxAttempts) {
        await this.remove(item.key);
        return;
      }
      const backoff = Math.min(
        this.retryMaxMs,
        this.retryBaseMs * 2 ** Math.max(0, attemptCount - 1),
      );
      const nowMs = this.clock.now();
      const failed: PendingDelivery = {
        ...item,
        attemptCount,
        nextRetryAtMs: nowMs + backoff,
        updatedAtMs: nowMs,
        lastError: error instanceof Error ? error.message : String(error),
      };
      await this.markFailure(failed);
    }
  }

  private async markFailure(item: PendingDelivery): Promise<void> {
    if (this.outboxStore) {
      await this.outboxStore.updateFederationOutboxFailure({
        key: item.key,
        attemptCount: item.attemptCount,
        nextRetryAtMs: item.nextRetryAtMs,
        updatedAtMs: item.updatedAtMs ?? this.clock.now(),
        lastError: item.lastError,
      });
      return;
    }
    this.pendingByKey.set(item.key, item);
  }

  private async remove(key: string): Promise<void> {
    if (this.outboxStore) {
      await this.outboxStore.deleteFederationOutbox(key);
      return;
    }
    this.pendingByKey.delete(key);
  }

  private buildKey(envelopeId: string, targetDomain: string): string {
    return `${targetDomain}:${envelopeId}`;
  }
}

function resolveOutboxStore(store: MailboxStore | undefined): FederationDeliveryOutboxStore | undefined {
  if (!store) {
    return undefined;
  }
  if (
    typeof store.enqueueFederationOutbox !== 'function'
    || typeof store.listDueFederationOutbox !== 'function'
    || typeof store.updateFederationOutboxFailure !== 'function'
    || typeof store.deleteFederationOutbox !== 'function'
  ) {
    return undefined;
  }
  return {
    enqueueFederationOutbox: store.enqueueFederationOutbox.bind(store),
    listDueFederationOutbox: store.listDueFederationOutbox.bind(store),
    updateFederationOutboxFailure: store.updateFederationOutboxFailure.bind(store),
    deleteFederationOutbox: store.deleteFederationOutbox.bind(store),
    countFederationOutbox: typeof store.countFederationOutbox === 'function'
      ? store.countFederationOutbox.bind(store)
      : undefined,
  };
}

function serializeEnvelope(envelope: Envelope): Record<string, unknown> {
  return {
    ...envelope,
    seq: envelope.seq.toString(),
  };
}

async function safeResponseSnippet(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) {
      return 'empty body';
    }
    return text.slice(0, 512);
  } catch {
    return 'unable to read response body';
  }
}
