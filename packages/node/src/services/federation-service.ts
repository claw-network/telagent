import { ErrorCodes, TelagentError } from '@telagent/protocol';

type FederationScope = 'envelopes' | 'group-state-sync' | 'receipts';

interface FederationEnvelope {
  envelopeId: string;
  sourceDomain: string;
  payload: Record<string, unknown>;
  payloadSignature: string;
  receivedAtMs: number;
}

interface FederationReceipt {
  envelopeId: string;
  sourceDomain: string;
  status: 'delivered' | 'read';
  receivedAtMs: number;
}

interface GroupStateSyncRecord {
  groupId: string;
  state: 'PENDING_ONCHAIN' | 'ACTIVE' | 'REORGED_BACK';
  sourceDomain: string;
  groupDomain: string;
  updatedAtMs: number;
}

interface RateLimitBucket {
  windowStartMs: number;
  used: number;
}

export interface FederationServiceClock {
  now(): number;
}

export interface FederationRequestMeta {
  sourceDomain: string;
  authToken?: string;
}

export interface FederationServiceOptions {
  selfDomain: string;
  authToken?: string;
  allowedSourceDomains?: string[];
  envelopeRateLimitPerMinute?: number;
  groupStateSyncRateLimitPerMinute?: number;
  receiptRateLimitPerMinute?: number;
  clock?: FederationServiceClock;
}

const SYSTEM_CLOCK: FederationServiceClock = {
  now: () => Date.now(),
};

const VALID_GROUP_STATES = new Set(['PENDING_ONCHAIN', 'ACTIVE', 'REORGED_BACK']);

export class FederationService {
  private readonly envelopeById = new Map<string, FederationEnvelope>();
  private readonly receiptByKey = new Map<string, FederationReceipt>();
  private readonly groupStateSyncByKey = new Map<string, GroupStateSyncRecord>();
  private readonly rateLimitByKey = new Map<string, RateLimitBucket>();

  private readonly selfDomain: string;
  private readonly authToken?: string;
  private readonly allowedSourceDomains: Set<string>;
  private readonly clock: FederationServiceClock;
  private readonly rateLimitConfig: Record<FederationScope, number>;

  constructor(options: FederationServiceOptions) {
    this.selfDomain = this.normalizeDomain(options.selfDomain, 'selfDomain');
    this.authToken = options.authToken;
    this.allowedSourceDomains = new Set((options.allowedSourceDomains ?? []).map((item) => this.normalizeDomain(item, 'allowedSourceDomains')));
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.rateLimitConfig = {
      envelopes: options.envelopeRateLimitPerMinute ?? 600,
      'group-state-sync': options.groupStateSyncRateLimitPerMinute ?? 300,
      receipts: options.receiptRateLimitPerMinute ?? 600,
    };
  }

  receiveEnvelope(
    payload: Record<string, unknown>,
    meta: FederationRequestMeta,
  ): { accepted: boolean; id: string; deduplicated: boolean; retryable: boolean } {
    const sourceDomain = this.assertAndNormalizeSourceDomain(meta.sourceDomain);
    this.assertAuthorized(meta.authToken);
    this.assertRateLimit('envelopes', sourceDomain);

    const envelopeId = this.assertRequiredString(payload.envelopeId, 'envelopeId');
    const signature = this.signatureOfPayload(payload);
    const existing = this.envelopeById.get(envelopeId);
    if (existing) {
      if (existing.payloadSignature !== signature || existing.sourceDomain !== sourceDomain) {
        throw new TelagentError(ErrorCodes.CONFLICT, `envelopeId(${envelopeId}) conflicts with existing payload`);
      }
      return {
        accepted: true,
        id: envelopeId,
        deduplicated: true,
        retryable: true,
      };
    }

    this.envelopeById.set(envelopeId, {
      envelopeId,
      sourceDomain,
      payload,
      payloadSignature: signature,
      receivedAtMs: this.clock.now(),
    });

    return {
      accepted: true,
      id: envelopeId,
      deduplicated: false,
      retryable: true,
    };
  }

  syncGroupState(
    payload: { groupId: string; state: string; groupDomain?: string },
    meta: FederationRequestMeta,
  ): { synced: boolean; updatedAtMs: number; deduplicated: boolean } {
    const sourceDomain = this.assertAndNormalizeSourceDomain(meta.sourceDomain);
    this.assertAuthorized(meta.authToken);
    this.assertRateLimit('group-state-sync', sourceDomain);

    const groupId = this.assertRequiredString(payload.groupId, 'groupId');
    if (!/^0x[0-9a-fA-F]{64}$/.test(groupId)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'groupId must be bytes32 hex string');
    }

    const state = this.assertRequiredString(payload.state, 'state').toUpperCase();
    if (!VALID_GROUP_STATES.has(state)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'state must be one of PENDING_ONCHAIN|ACTIVE|REORGED_BACK');
    }

    const groupDomain = payload.groupDomain
      ? this.normalizeDomain(payload.groupDomain, 'groupDomain')
      : sourceDomain;
    if (groupDomain !== sourceDomain) {
      throw new TelagentError(ErrorCodes.FORBIDDEN, 'groupDomain must match sourceDomain');
    }

    const key = `${sourceDomain}:${groupId}`;
    const existing = this.groupStateSyncByKey.get(key);
    const deduplicated = !!existing && existing.state === state && existing.groupDomain === groupDomain;
    const updatedAtMs = this.clock.now();

    this.groupStateSyncByKey.set(key, {
      groupId,
      state: state as GroupStateSyncRecord['state'],
      sourceDomain,
      groupDomain,
      updatedAtMs,
    });

    return {
      synced: true,
      updatedAtMs,
      deduplicated,
    };
  }

  recordReceipt(
    payload: { envelopeId: string; status: 'delivered' | 'read' },
    meta: FederationRequestMeta,
  ): { accepted: boolean; deduplicated: boolean; retryable: boolean } {
    const sourceDomain = this.assertAndNormalizeSourceDomain(meta.sourceDomain);
    this.assertAuthorized(meta.authToken);
    this.assertRateLimit('receipts', sourceDomain);

    const envelopeId = this.assertRequiredString(payload.envelopeId, 'envelopeId');
    if (payload.status !== 'delivered' && payload.status !== 'read') {
      throw new TelagentError(ErrorCodes.VALIDATION, 'status must be delivered or read');
    }

    const key = `${sourceDomain}:${envelopeId}:${payload.status}`;
    if (this.receiptByKey.has(key)) {
      return {
        accepted: true,
        deduplicated: true,
        retryable: true,
      };
    }

    this.receiptByKey.set(key, {
      envelopeId,
      sourceDomain,
      status: payload.status,
      receivedAtMs: this.clock.now(),
    });

    return {
      accepted: true,
      deduplicated: false,
      retryable: true,
    };
  }

  nodeInfo(): {
    protocolVersion: string;
    domain: string;
    capabilities: string[];
    envelopeCount: number;
    receiptCount: number;
    groupStateSyncCount: number;
    security: {
      authMode: 'required' | 'none';
      allowedSourceDomains: string[];
      rateLimitPerMinute: Record<FederationScope, number>;
    };
  } {
    return {
      protocolVersion: 'v1',
      domain: this.selfDomain,
      capabilities: ['identity', 'groups', 'messages', 'attachments', 'federation'],
      envelopeCount: this.envelopeById.size,
      receiptCount: this.receiptByKey.size,
      groupStateSyncCount: this.groupStateSyncByKey.size,
      security: {
        authMode: this.authToken ? 'required' : 'none',
        allowedSourceDomains: [...this.allowedSourceDomains.values()],
        rateLimitPerMinute: { ...this.rateLimitConfig },
      },
    };
  }

  private assertRateLimit(scope: FederationScope, sourceDomain: string): void {
    const nowMs = this.clock.now();
    const key = `${scope}:${sourceDomain}`;
    const bucket = this.rateLimitByKey.get(key) ?? { windowStartMs: nowMs, used: 0 };
    if (nowMs - bucket.windowStartMs >= 60_000) {
      bucket.windowStartMs = nowMs;
      bucket.used = 0;
    }

    if (bucket.used >= this.rateLimitConfig[scope]) {
      throw new TelagentError(
        ErrorCodes.TOO_MANY_REQUESTS,
        `federation ${scope} rate limit exceeded for ${sourceDomain}`,
      );
    }

    bucket.used += 1;
    this.rateLimitByKey.set(key, bucket);
  }

  private assertAuthorized(authToken?: string): void {
    if (!this.authToken) {
      return;
    }
    if (!authToken || authToken !== this.authToken) {
      throw new TelagentError(ErrorCodes.UNAUTHORIZED, 'federation auth token is invalid');
    }
  }

  private assertAndNormalizeSourceDomain(sourceDomain: string): string {
    const normalized = this.normalizeDomain(sourceDomain, 'sourceDomain');
    if (this.allowedSourceDomains.size > 0 && !this.allowedSourceDomains.has(normalized)) {
      throw new TelagentError(ErrorCodes.FORBIDDEN, `sourceDomain(${normalized}) is not allowed`);
    }
    return normalized;
  }

  private normalizeDomain(input: string, fieldName: string): string {
    const normalized = this.assertRequiredString(input, fieldName).trim().toLowerCase();
    const pattern =
      /^(localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?::\d{1,5})?$/;
    if (!pattern.test(normalized)) {
      throw new TelagentError(ErrorCodes.VALIDATION, `${fieldName} is not a valid federation domain`);
    }
    return normalized;
  }

  private assertRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TelagentError(ErrorCodes.VALIDATION, `${fieldName} is required`);
    }
    return value;
  }

  private signatureOfPayload(payload: Record<string, unknown>): string {
    return JSON.stringify(payload);
  }
}
