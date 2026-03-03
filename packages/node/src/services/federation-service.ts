import { ErrorCodes, TelagentError } from '@telagent/protocol';

type FederationScope = 'envelopes' | 'group-state-sync' | 'receipts';
type FederationPinningMode = 'disabled' | 'enforced' | 'report-only';

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
  stateVersion: number;
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
  protocolVersion?: string;
  sourceKeyId?: string;
}

export interface FederationServiceOptions {
  selfDomain: string;
  authToken?: string;
  allowedSourceDomains?: string[];
  protocolVersion?: string;
  supportedProtocolVersions?: string[];
  envelopeRateLimitPerMinute?: number;
  groupStateSyncRateLimitPerMinute?: number;
  receiptRateLimitPerMinute?: number;
  pinningMode?: FederationPinningMode;
  pinningCurrentKeysByDomain?: Record<string, string[]>;
  pinningNextKeysByDomain?: Record<string, string[]>;
  pinningCutoverAtMs?: number;
  clock?: FederationServiceClock;
}

interface FederationPinningPolicy {
  current: Set<string>;
  next: Set<string>;
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
  private staleGroupStateSyncRejected = 0;
  private splitBrainGroupStateSyncDetected = 0;

  private readonly selfDomain: string;
  private readonly authToken?: string;
  private readonly allowedSourceDomains: Set<string>;
  private readonly pinningMode: FederationPinningMode;
  private readonly pinningPolicyByDomain: Map<string, FederationPinningPolicy>;
  private readonly pinningCutoverAtMs?: number;
  private readonly protocolVersion: string;
  private readonly supportedProtocolVersions: Set<string>;
  private readonly clock: FederationServiceClock;
  private readonly rateLimitConfig: Record<FederationScope, number>;
  private readonly protocolUsageCounts = new Map<string, number>();
  private acceptedWithoutProtocolHint = 0;
  private acceptedWithProtocolHint = 0;
  private unsupportedProtocolRejected = 0;
  private pinningAcceptedWithCurrent = 0;
  private pinningAcceptedWithNext = 0;
  private pinningRejected = 0;
  private pinningReportOnlyWarnings = 0;

  constructor(options: FederationServiceOptions) {
    this.selfDomain = this.normalizeDomain(options.selfDomain, 'selfDomain');
    this.authToken = options.authToken;
    this.allowedSourceDomains = new Set((options.allowedSourceDomains ?? []).map((item) => this.normalizeDomain(item, 'allowedSourceDomains')));
    this.pinningMode = this.normalizePinningMode(options.pinningMode ?? 'disabled');
    this.pinningPolicyByDomain = this.createPinningPolicy(
      options.pinningCurrentKeysByDomain ?? {},
      options.pinningNextKeysByDomain ?? {},
    );
    this.pinningCutoverAtMs = this.normalizePinningCutoverAt(options.pinningCutoverAtMs);
    this.protocolVersion = this.normalizeProtocolVersion(options.protocolVersion ?? 'v1', 'protocolVersion');
    this.supportedProtocolVersions = new Set(
      (options.supportedProtocolVersions ?? [this.protocolVersion]).map((item) =>
        this.normalizeProtocolVersion(item, 'supportedProtocolVersions'),
      ),
    );
    this.supportedProtocolVersions.add(this.protocolVersion);
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
    this.assertSourcePinning(sourceDomain, meta.sourceKeyId);
    const protocolVersion = this.assertAndResolveProtocolVersion(meta.protocolVersion);
    this.assertRateLimit('envelopes', sourceDomain);

    const envelopeId = this.assertRequiredString(payload.envelopeId, 'envelopeId');
    const signature = this.signatureOfPayload(payload);
    const existing = this.envelopeById.get(envelopeId);
    if (existing) {
      if (existing.payloadSignature !== signature || existing.sourceDomain !== sourceDomain) {
        throw new TelagentError(ErrorCodes.CONFLICT, `envelopeId(${envelopeId}) conflicts with existing payload`);
      }
      this.recordProtocolAcceptance(protocolVersion, typeof meta.protocolVersion === 'string' && meta.protocolVersion.trim().length > 0);
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
    this.recordProtocolAcceptance(protocolVersion, typeof meta.protocolVersion === 'string' && meta.protocolVersion.trim().length > 0);

    return {
      accepted: true,
      id: envelopeId,
      deduplicated: false,
      retryable: true,
    };
  }

  syncGroupState(
    payload: { groupId: string; state: string; groupDomain?: string; stateVersion?: number },
    meta: FederationRequestMeta,
  ): { synced: boolean; updatedAtMs: number; deduplicated: boolean; stateVersion: number } {
    const sourceDomain = this.assertAndNormalizeSourceDomain(meta.sourceDomain);
    this.assertAuthorized(meta.authToken);
    this.assertSourcePinning(sourceDomain, meta.sourceKeyId);
    const protocolVersion = this.assertAndResolveProtocolVersion(meta.protocolVersion);
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
    const requestedStateVersion = this.parseStateVersion(payload.stateVersion);
    const conflictReason = this.detectStateSyncConflict(existing, {
      state: state as GroupStateSyncRecord['state'],
      groupDomain,
      stateVersion: requestedStateVersion,
    });
    if (conflictReason) {
      this.recordStateSyncConflict(conflictReason);
      if (conflictReason === 'stale') {
        throw new TelagentError(ErrorCodes.CONFLICT, 'group-state sync is stale for current stateVersion');
      }
      throw new TelagentError(ErrorCodes.CONFLICT, 'group-state sync conflict detected (split-brain)');
    }

    const deduplicated = this.isStateSyncDeduplicated(existing, {
      state: state as GroupStateSyncRecord['state'],
      groupDomain,
      stateVersion: requestedStateVersion,
    });
    const resolvedStateVersion = this.resolveStateVersion(existing, requestedStateVersion, deduplicated);
    const updatedAtMs = this.clock.now();

    this.groupStateSyncByKey.set(key, {
      groupId,
      state: state as GroupStateSyncRecord['state'],
      stateVersion: resolvedStateVersion,
      sourceDomain,
      groupDomain,
      updatedAtMs,
    });
    this.recordProtocolAcceptance(protocolVersion, typeof meta.protocolVersion === 'string' && meta.protocolVersion.trim().length > 0);

    return {
      synced: true,
      updatedAtMs,
      deduplicated,
      stateVersion: resolvedStateVersion,
    };
  }

  recordReceipt(
    payload: { envelopeId: string; status: 'delivered' | 'read' },
    meta: FederationRequestMeta,
  ): { accepted: boolean; deduplicated: boolean; retryable: boolean } {
    const sourceDomain = this.assertAndNormalizeSourceDomain(meta.sourceDomain);
    this.assertAuthorized(meta.authToken);
    this.assertSourcePinning(sourceDomain, meta.sourceKeyId);
    const protocolVersion = this.assertAndResolveProtocolVersion(meta.protocolVersion);
    this.assertRateLimit('receipts', sourceDomain);

    const envelopeId = this.assertRequiredString(payload.envelopeId, 'envelopeId');
    if (payload.status !== 'delivered' && payload.status !== 'read') {
      throw new TelagentError(ErrorCodes.VALIDATION, 'status must be delivered or read');
    }

    const key = `${sourceDomain}:${envelopeId}:${payload.status}`;
    if (this.receiptByKey.has(key)) {
      this.recordProtocolAcceptance(protocolVersion, typeof meta.protocolVersion === 'string' && meta.protocolVersion.trim().length > 0);
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
    this.recordProtocolAcceptance(protocolVersion, typeof meta.protocolVersion === 'string' && meta.protocolVersion.trim().length > 0);

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
    compatibility: {
      protocolVersion: string;
      supportedProtocolVersions: string[];
      stats: {
        acceptedWithoutProtocolHint: number;
        acceptedWithProtocolHint: number;
        unsupportedProtocolRejected: number;
        usageByVersion: Record<string, number>;
      };
    };
    security: {
      authMode: 'required' | 'none';
      allowedSourceDomains: string[];
      rateLimitPerMinute: Record<FederationScope, number>;
      pinning: {
        mode: FederationPinningMode;
        cutoverAt: string | null;
        cutoverReached: boolean;
        configuredDomains: string[];
        stats: {
          acceptedWithCurrent: number;
          acceptedWithNext: number;
          rejected: number;
          reportOnlyWarnings: number;
        };
      };
    };
    resilience: {
      staleGroupStateSyncRejected: number;
      splitBrainGroupStateSyncDetected: number;
      totalGroupStateSyncConflicts: number;
    };
  } {
    return {
      protocolVersion: this.protocolVersion,
      domain: this.selfDomain,
      capabilities: ['identity', 'groups', 'messages', 'attachments', 'federation'],
      envelopeCount: this.envelopeById.size,
      receiptCount: this.receiptByKey.size,
      groupStateSyncCount: this.groupStateSyncByKey.size,
      compatibility: {
        protocolVersion: this.protocolVersion,
        supportedProtocolVersions: [...this.supportedProtocolVersions.values()].sort(),
        stats: {
          acceptedWithoutProtocolHint: this.acceptedWithoutProtocolHint,
          acceptedWithProtocolHint: this.acceptedWithProtocolHint,
          unsupportedProtocolRejected: this.unsupportedProtocolRejected,
          usageByVersion: Object.fromEntries([...this.protocolUsageCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
        },
      },
      security: {
        authMode: this.authToken ? 'required' : 'none',
        allowedSourceDomains: [...this.allowedSourceDomains.values()],
        rateLimitPerMinute: { ...this.rateLimitConfig },
        pinning: {
          mode: this.pinningMode,
          cutoverAt: typeof this.pinningCutoverAtMs === 'number' ? new Date(this.pinningCutoverAtMs).toISOString() : null,
          cutoverReached: this.isPinningCutoverReached(),
          configuredDomains: [...this.pinningPolicyByDomain.keys()].sort(),
          stats: {
            acceptedWithCurrent: this.pinningAcceptedWithCurrent,
            acceptedWithNext: this.pinningAcceptedWithNext,
            rejected: this.pinningRejected,
            reportOnlyWarnings: this.pinningReportOnlyWarnings,
          },
        },
      },
      resilience: {
        staleGroupStateSyncRejected: this.staleGroupStateSyncRejected,
        splitBrainGroupStateSyncDetected: this.splitBrainGroupStateSyncDetected,
        totalGroupStateSyncConflicts: this.staleGroupStateSyncRejected + this.splitBrainGroupStateSyncDetected,
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

  private assertSourcePinning(sourceDomain: string, sourceKeyId?: string): void {
    if (this.pinningMode === 'disabled') {
      return;
    }

    try {
      this.assertSourcePinningStrict(sourceDomain, sourceKeyId);
    } catch (error) {
      if (error instanceof TelagentError) {
        this.pinningRejected++;
      }
      if (this.pinningMode === 'report-only') {
        this.pinningReportOnlyWarnings++;
        return;
      }
      throw error;
    }
  }

  private assertSourcePinningStrict(sourceDomain: string, sourceKeyId?: string): void {
    const policy = this.pinningPolicyByDomain.get(sourceDomain);
    if (!policy) {
      throw new TelagentError(ErrorCodes.FORBIDDEN, `sourceDomain(${sourceDomain}) has no pinning policy`);
    }

    const normalizedKeyId = this.normalizeSourceKeyId(sourceKeyId, true);
    const inCurrent = policy.current.has(normalizedKeyId);
    const inNext = policy.next.has(normalizedKeyId);

    if (this.isPinningCutoverReached() && policy.next.size > 0 && inCurrent && !inNext) {
      throw new TelagentError(
        ErrorCodes.FORBIDDEN,
        `sourceKeyId(${normalizedKeyId}) expired after pinning cutover for sourceDomain(${sourceDomain})`,
      );
    }

    if (inCurrent) {
      this.pinningAcceptedWithCurrent++;
      return;
    }
    if (inNext) {
      this.pinningAcceptedWithNext++;
      return;
    }

    throw new TelagentError(
      ErrorCodes.FORBIDDEN,
      `sourceKeyId(${normalizedKeyId}) is not pinned for sourceDomain(${sourceDomain})`,
    );
  }

  private assertAndNormalizeSourceDomain(sourceDomain: string): string {
    const normalized = this.normalizeDomain(sourceDomain, 'sourceDomain');
    if (this.allowedSourceDomains.size > 0 && !this.allowedSourceDomains.has(normalized)) {
      throw new TelagentError(ErrorCodes.FORBIDDEN, `sourceDomain(${normalized}) is not allowed`);
    }
    return normalized;
  }

  private normalizeSourceKeyId(sourceKeyId: string | undefined, required: boolean): string {
    if (!sourceKeyId || !sourceKeyId.trim()) {
      if (required) {
        throw new TelagentError(ErrorCodes.UNAUTHORIZED, 'sourceKeyId is required when federation pinning is enabled');
      }
      return '';
    }
    const normalized = sourceKeyId.trim();
    if (!/^[A-Za-z0-9._:-]{3,128}$/.test(normalized)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'sourceKeyId is not a valid key fingerprint');
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

  private normalizePinningMode(input: string): FederationPinningMode {
    if (input === 'disabled' || input === 'enforced' || input === 'report-only') {
      return input;
    }
    throw new TelagentError(ErrorCodes.VALIDATION, `pinningMode(${input}) is invalid`);
  }

  private normalizePinningCutoverAt(value: number | undefined): number | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'pinningCutoverAtMs must be a positive number');
    }
    return value;
  }

  private createPinningPolicy(
    currentByDomain: Record<string, string[]>,
    nextByDomain: Record<string, string[]>,
  ): Map<string, FederationPinningPolicy> {
    const policy = new Map<string, FederationPinningPolicy>();
    const merge = (domain: string, keys: string[], target: 'current' | 'next'): void => {
      const normalizedDomain = this.normalizeDomain(domain, 'pinningDomain');
      const normalizedKeys = keys.map((key) => this.normalizeSourceKeyId(key, true));
      if (normalizedKeys.length === 0) {
        return;
      }
      if (!policy.has(normalizedDomain)) {
        policy.set(normalizedDomain, {
          current: new Set<string>(),
          next: new Set<string>(),
        });
      }
      const bucket = policy.get(normalizedDomain)!;
      for (const key of normalizedKeys) {
        bucket[target].add(key);
      }
    };

    for (const [domain, keys] of Object.entries(currentByDomain)) {
      merge(domain, keys, 'current');
    }
    for (const [domain, keys] of Object.entries(nextByDomain)) {
      merge(domain, keys, 'next');
    }

    return policy;
  }

  private isPinningCutoverReached(): boolean {
    if (typeof this.pinningCutoverAtMs !== 'number') {
      return false;
    }
    return this.clock.now() >= this.pinningCutoverAtMs;
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

  private normalizeProtocolVersion(input: string, fieldName: string): string {
    const normalized = this.assertRequiredString(input, fieldName).trim().toLowerCase();
    if (!/^v[0-9]+(?:\.[0-9]+)?$/.test(normalized)) {
      throw new TelagentError(ErrorCodes.VALIDATION, `${fieldName} must match pattern vN or vN.M`);
    }
    return normalized;
  }

  private assertAndResolveProtocolVersion(protocolVersion: string | undefined): string {
    if (!protocolVersion || !protocolVersion.trim()) {
      return this.protocolVersion;
    }

    const normalized = this.normalizeProtocolVersion(protocolVersion, 'protocolVersion');
    if (!this.supportedProtocolVersions.has(normalized)) {
      this.unsupportedProtocolRejected++;
      throw new TelagentError(
        ErrorCodes.UNPROCESSABLE,
        `protocolVersion(${normalized}) is not compatible with supported set ${[...this.supportedProtocolVersions.values()].join(',')}`,
      );
    }
    return normalized;
  }

  private recordProtocolAcceptance(protocolVersion: string, hinted: boolean): void {
    if (hinted) {
      this.acceptedWithProtocolHint++;
    } else {
      this.acceptedWithoutProtocolHint++;
    }
    this.protocolUsageCounts.set(protocolVersion, (this.protocolUsageCounts.get(protocolVersion) ?? 0) + 1);
  }

  private parseStateVersion(value: unknown): number | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'stateVersion must be a positive integer');
    }
    return value;
  }

  private detectStateSyncConflict(
    existing: GroupStateSyncRecord | undefined,
    incoming: {
      state: GroupStateSyncRecord['state'];
      groupDomain: string;
      stateVersion?: number;
    },
  ): 'stale' | 'split-brain' | null {
    if (!existing || typeof incoming.stateVersion === 'undefined') {
      return null;
    }
    if (incoming.stateVersion < existing.stateVersion) {
      return 'stale';
    }
    if (incoming.stateVersion > existing.stateVersion) {
      return null;
    }
    if (incoming.state === existing.state && incoming.groupDomain === existing.groupDomain) {
      return null;
    }
    return 'split-brain';
  }

  private isStateSyncDeduplicated(
    existing: GroupStateSyncRecord | undefined,
    incoming: {
      state: GroupStateSyncRecord['state'];
      groupDomain: string;
      stateVersion?: number;
    },
  ): boolean {
    if (!existing) {
      return false;
    }
    if (incoming.state !== existing.state || incoming.groupDomain !== existing.groupDomain) {
      return false;
    }
    if (typeof incoming.stateVersion === 'undefined') {
      return true;
    }
    return incoming.stateVersion === existing.stateVersion;
  }

  private resolveStateVersion(
    existing: GroupStateSyncRecord | undefined,
    requestedStateVersion: number | undefined,
    deduplicated: boolean,
  ): number {
    if (!existing) {
      return requestedStateVersion ?? 1;
    }
    if (deduplicated) {
      return existing.stateVersion;
    }
    if (typeof requestedStateVersion === 'undefined') {
      return existing.stateVersion + 1;
    }
    return requestedStateVersion;
  }

  private recordStateSyncConflict(type: 'stale' | 'split-brain'): void {
    if (type === 'stale') {
      this.staleGroupStateSyncRejected++;
      return;
    }
    this.splitBrainGroupStateSyncDetected++;
  }
}
