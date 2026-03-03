import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { ErrorCodes, TelagentError, hashDid } from '@telagent/protocol';

import { ApiServer } from './api/server.js';
import type { RuntimeContext } from './api/types.js';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

class FakeIdentityService {
  private readonly revokedDidHashes = new Set<string>();
  private readonly revocationSubscribers = new Set<
    (event: { did: string; didHash: string; revokedAtMs: number; source: string }) => void
  >();

  async getSelf() {
    return {
      did: 'did:claw:zSelf',
      didHash: '0x' + '1'.repeat(64),
      controller: '0x' + '1'.repeat(40),
      publicKey: '0x11',
      isActive: true,
      resolvedAtMs: Date.now(),
    };
  }

  async resolve(did: string) {
    return {
      did,
      didHash: '0x' + '2'.repeat(64),
      controller: '0x' + '2'.repeat(40),
      publicKey: '0x22',
      isActive: true,
      resolvedAtMs: Date.now(),
    };
  }

  subscribeDidRevocations(listener: (event: {
    did: string;
    didHash: string;
    revokedAtMs: number;
    source: string;
  }) => void): () => void {
    this.revocationSubscribers.add(listener);
    return () => {
      this.revocationSubscribers.delete(listener);
    };
  }

  notifyDidRevoked(
    did: string,
    options?: {
      source?: string;
      revokedAtMs?: number;
    },
  ) {
    const didHash = hashDid(did);
    this.revokedDidHashes.add(didHash);
    const event = {
      did,
      didHash,
      revokedAtMs: options?.revokedAtMs ?? Date.now(),
      source: options?.source?.trim() || 'manual',
    };
    for (const subscriber of this.revocationSubscribers) {
      subscriber(event);
    }
    return event;
  }

  async assertActiveDid(did: string) {
    if (this.revokedDidHashes.has(hashDid(did))) {
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'DID is revoked or inactive');
    }
    return this.resolve(did);
  }
}

class FakeGroupService {
  async createGroup(_input: unknown) {
    return {
      txHash: '0x' + 'a'.repeat(64),
      group: {
        groupId: '0x' + 'b'.repeat(64),
        creatorDid: 'did:claw:zSelf',
        creatorDidHash: '0x' + '1'.repeat(64),
        groupDomain: 'alpha.tel',
        domainProofHash: '0x' + '3'.repeat(64),
        initialMlsStateHash: '0x' + '4'.repeat(64),
        state: 'ACTIVE',
        createdAtMs: Date.now(),
        txHash: '0x' + 'a'.repeat(64),
        blockNumber: 100,
      },
    };
  }

  async inviteMember() {
    return { txHash: '0x' + 'c'.repeat(64) };
  }

  async acceptInvite() {
    return { txHash: '0x' + 'd'.repeat(64) };
  }

  async removeMember() {
    return { txHash: '0x' + 'e'.repeat(64) };
  }

  getGroup(groupId: string) {
    return {
      groupId,
      creatorDid: 'did:claw:zSelf',
      creatorDidHash: '0x' + '1'.repeat(64),
      groupDomain: 'alpha.tel',
      domainProofHash: '0x' + '3'.repeat(64),
      initialMlsStateHash: '0x' + '4'.repeat(64),
      state: 'ACTIVE',
      createdAtMs: Date.now(),
      txHash: '0x' + '5'.repeat(64),
      blockNumber: 100,
    };
  }

  listGroups() {
    return [
      this.getGroup('0x' + 'b'.repeat(64)),
      {
        ...this.getGroup('0x' + 'c'.repeat(64)),
        groupDomain: 'beta.tel',
        state: 'PENDING_ONCHAIN' as const,
      },
    ];
  }

  listMembers(groupId?: string) {
    if (groupId === '0x' + 'c'.repeat(64)) {
      return [
        {
          groupId: '0x' + 'c'.repeat(64),
          did: 'did:claw:zM3',
          didHash: '0x' + '9'.repeat(64),
          state: 'PENDING',
          joinedAtMs: Date.now(),
        },
      ];
    }
    return [
      {
        groupId: '0x' + 'b'.repeat(64),
        did: 'did:claw:zM1',
        didHash: '0x' + '6'.repeat(64),
        state: 'FINALIZED',
        joinedAtMs: Date.now(),
      },
      {
        groupId: '0x' + 'b'.repeat(64),
        did: 'did:claw:zM2',
        didHash: '0x' + '7'.repeat(64),
        state: 'PENDING',
        joinedAtMs: Date.now(),
      },
    ];
  }

  getChainState(groupId: string) {
    return {
      groupId,
      state: 'ACTIVE',
      finalizedTxHash: '0x' + '5'.repeat(64),
      blockNumber: 100,
      updatedAtMs: Date.now(),
    };
  }
}

class FakeGasService {
  async getNativeGasBalance() {
    return 1_000_000n;
  }

  async getTokenBalance() {
    return 900_000n;
  }
}

class FakeMessageService {
  private nextSeq = 1n;
  private readonly trackedConversationIdsByDidHash = new Map<string, Set<string>>();
  private readonly isolatedConversationById = new Map<string, {
    didHash: string;
    isolatedAtMs: number;
    source: string;
  }>();
  private readonly isolationEvents: Array<{
    didHash: string;
    revokedAtMs: number;
    source: string;
    isolatedConversationCount: number;
    evictedConversationCount: number;
  }> = [];
  private readonly revokedDidHashes = new Set<string>();

  constructor(private readonly identityService: FakeIdentityService) {
    this.identityService.subscribeDidRevocations((event) => {
      this.revokedDidHashes.add(event.didHash);
      const relatedConversationIds = [...(this.trackedConversationIdsByDidHash.get(event.didHash) ?? [])];
      for (const conversationId of relatedConversationIds) {
        this.isolatedConversationById.set(conversationId, {
          didHash: event.didHash,
          isolatedAtMs: event.revokedAtMs,
          source: event.source,
        });
      }
      this.isolationEvents.push({
        didHash: event.didHash,
        revokedAtMs: event.revokedAtMs,
        source: event.source,
        isolatedConversationCount: relatedConversationIds.length,
        evictedConversationCount: relatedConversationIds.length,
      });
    });
  }

  async send(input: {
    envelopeId?: string;
    senderDid: string;
    conversationId: string;
    conversationType: 'direct' | 'group';
    targetDomain: string;
    mailboxKeyId: string;
    sealedHeader: string;
    ciphertext: string;
    contentType: 'text' | 'image' | 'file' | 'control';
    ttlSec: number;
  }) {
    if (this.isolatedConversationById.has(input.conversationId)) {
      throw new TelagentError(
        ErrorCodes.UNPROCESSABLE,
        `conversation(${input.conversationId}) is isolated due to revoked DID`,
      );
    }

    const senderDidHash = hashDid(input.senderDid);
    if (this.revokedDidHashes.has(senderDidHash)) {
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, `senderDid(${input.senderDid}) is revoked and isolated`);
    }
    await this.identityService.assertActiveDid(input.senderDid);

    const tracked = this.trackedConversationIdsByDidHash.get(senderDidHash);
    if (tracked) {
      tracked.add(input.conversationId);
    } else {
      this.trackedConversationIdsByDidHash.set(senderDidHash, new Set([input.conversationId]));
    }

    const seq = this.nextSeq;
    this.nextSeq += 1n;
    return {
      envelopeId: input.envelopeId ?? `env-${seq}`,
      conversationId: input.conversationId,
      conversationType: input.conversationType,
      routeHint: {
        targetDomain: input.targetDomain,
        mailboxKeyId: input.mailboxKeyId,
      },
      sealedHeader: input.sealedHeader,
      seq,
      ciphertext: input.ciphertext,
      contentType: input.contentType,
      sentAtMs: Date.now(),
      ttlSec: input.ttlSec,
      provisional: false,
    };
  }

  pull() {
    return {
      items: [],
      nextCursor: null,
    };
  }

  listRetracted() {
    return [
      {
        envelopeId: 'env-retracted-1',
        conversationId: 'group:0x' + 'b'.repeat(64),
        reason: 'REORGED_BACK',
        retractedAtMs: Date.now(),
      },
    ];
  }

  async buildAuditSnapshot(options?: { sampleSize?: number; retractionScanLimit?: number }) {
    const sampleSize = Math.max(1, Math.min(100, options?.sampleSize ?? 20));
    return {
      activeEnvelopeCount: 1,
      retractedCount: 1,
      retractedByReason: {
        REORGED_BACK: 1,
      },
      sampledRetractions: [
        {
          envelopeIdHash: 'a'.repeat(64),
          conversationIdHash: 'b'.repeat(64),
          reason: 'REORGED_BACK',
          retractedAtMs: Date.now(),
        },
      ].slice(0, sampleSize),
      revokedDidCount: this.revokedDidHashes.size,
      isolatedConversationCount: this.isolatedConversationById.size,
      isolationEventCount: this.isolationEvents.length,
      sampledIsolations: [...this.isolatedConversationById.entries()]
        .slice(0, sampleSize)
        .map(([conversationId, isolation]) => ({
          conversationIdHash: digest(conversationId),
          revokedDidHash: isolation.didHash,
          isolatedAtMs: isolation.isolatedAtMs,
          source: isolation.source,
        })),
      sampledIsolationEvents: this.isolationEvents
        .slice(0, sampleSize)
        .map((event) => ({
          didHash: event.didHash,
          revokedAtMs: event.revokedAtMs,
          source: event.source,
          isolatedConversationCount: event.isolatedConversationCount,
          evictedConversationCount: event.evictedConversationCount,
        })),
      sampleSize,
      retractionScanLimit: Math.max(1, Math.min(100_000, options?.retractionScanLimit ?? 2_000)),
    };
  }
}

class FakeAttachmentService {
  initUpload() {
    return {
      objectKey: 'attachments/o1',
      uploadUrl: 'https://uploads.telagent.local/attachments%2Fo1',
      expiresInSec: 900,
    };
  }

  completeUpload() {
    return {
      objectKey: 'attachments/o1',
      manifestHash: '0x' + '8'.repeat(64),
      checksum: '0x' + '9'.repeat(64),
      completedAtMs: Date.now(),
    };
  }
}

class FakeFederationService {
  private readonly dlqEntries: Array<{
    dlqId: string;
    sequence: number;
    scope: 'envelopes' | 'group-state-sync' | 'receipts';
    status: 'PENDING' | 'REPLAYED';
  }> = [];

  receiveEnvelope(
    payload: Record<string, unknown>,
    meta: { sourceDomain: string; authToken?: string; protocolVersion?: string; sourceKeyId?: string },
  ) {
    if (payload.envelopeId === 'fed-pin-required' && !meta.sourceKeyId) {
      throw new TelagentError(ErrorCodes.UNAUTHORIZED, 'sourceKeyId is required');
    }
    this.assertProtocol(meta.protocolVersion);
    if (payload.envelopeId === 'fed-force-error') {
      throw new TelagentError(ErrorCodes.CONFLICT, 'forced federation conflict');
    }
    return { accepted: true, id: 'fed-1', deduplicated: false, retryable: true };
  }

  syncGroupState(
    _payload: { groupId: string; state: string; groupDomain?: string; stateVersion?: number },
    meta: { sourceDomain: string; authToken?: string; protocolVersion?: string },
  ) {
    this.assertProtocol(meta.protocolVersion);
    return { synced: true, updatedAtMs: Date.now(), deduplicated: false, stateVersion: 1 };
  }

  recordReceipt(
    _payload: { envelopeId: string; status: 'delivered' | 'read' },
    meta: { sourceDomain: string; authToken?: string; protocolVersion?: string },
  ) {
    this.assertProtocol(meta.protocolVersion);
    return { accepted: true, deduplicated: false, retryable: true };
  }

  recordDlqFailure(
    scope: 'envelopes' | 'group-state-sync' | 'receipts',
    _payload: Record<string, unknown>,
    _meta: { sourceDomain?: string; protocolVersion?: string; sourceKeyId?: string } | undefined,
    _error: unknown,
  ) {
    const sequence = this.dlqEntries.length + 1;
    const entry = {
      dlqId: `dlq-test-${sequence}`,
      sequence,
      scope,
      status: 'PENDING' as const,
    };
    this.dlqEntries.push(entry);
    return entry;
  }

  listDlqEntries(options?: { status?: 'PENDING' | 'REPLAYED' | 'ALL' }) {
    const status = options?.status ?? 'PENDING';
    if (status === 'ALL') {
      return [...this.dlqEntries];
    }
    return this.dlqEntries.filter((entry) => entry.status === status);
  }

  replayDlq(options?: { ids?: string[]; maxItems?: number; stopOnError?: boolean }) {
    const candidates = this.listDlqEntries({ status: 'PENDING' });
    const filtered = Array.isArray(options?.ids) && options.ids.length > 0
      ? candidates.filter((entry) => options.ids!.includes(entry.dlqId))
      : candidates;
    const replayTargets = typeof options?.maxItems === 'number'
      ? filtered.slice(0, options.maxItems)
      : filtered;

    const results = replayTargets.map((entry) => ({
      dlqId: entry.dlqId,
      sequence: entry.sequence,
      scope: entry.scope,
      status: 'REPLAYED' as const,
      replayedAtMs: Date.now(),
    }));
    for (const entry of replayTargets) {
      entry.status = 'REPLAYED';
    }

    return {
      processed: replayTargets.length,
      replayed: replayTargets.length,
      failed: 0,
      results,
    };
  }

  nodeInfo() {
    return {
      protocolVersion: 'v1',
      domain: 'node-a.tel',
      capabilities: ['identity', 'groups', 'messages', 'attachments', 'federation'],
      envelopeCount: 0,
      receiptCount: 0,
      groupStateSyncCount: 0,
      compatibility: {
        protocolVersion: 'v1',
        supportedProtocolVersions: ['v1'],
        stats: {
          acceptedWithoutProtocolHint: 0,
          acceptedWithProtocolHint: 0,
          unsupportedProtocolRejected: 0,
          usageByVersion: {
            v1: 0,
          },
        },
      },
      security: {
        authMode: 'none',
        allowedSourceDomains: [],
        rateLimitPerMinute: {
          envelopes: 600,
          'group-state-sync': 300,
          receipts: 600,
        },
        pinning: {
          mode: 'disabled',
          cutoverAt: null,
          cutoverReached: false,
          configuredDomains: ['node-a.tel'],
          stats: {
            acceptedWithCurrent: 0,
            acceptedWithNext: 0,
            rejected: 0,
            reportOnlyWarnings: 0,
          },
        },
      },
      resilience: {
        staleGroupStateSyncRejected: 0,
        splitBrainGroupStateSyncDetected: 0,
        totalGroupStateSyncConflicts: 0,
      },
      dlq: {
        pendingCount: 0,
        replayedCount: 0,
        replaySuccessCount: 0,
        replayFailedCount: 0,
      },
    };
  }

  private assertProtocol(protocolVersion?: string): void {
    if (protocolVersion === 'v99') {
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'protocolVersion(v99) is not compatible');
    }
  }
}

class FakeMonitoringService {
  recordHttpRequest() {}

  recordMailboxMaintenance() {}

  snapshot() {
    return {
      generatedAt: new Date().toISOString(),
      uptimeSec: 120,
      totals: {
        requests: 12,
        status2xx: 11,
        status4xx: 1,
        status5xx: 0,
        statusOther: 0,
        errorRateRatio: 0,
        avgLatencyMs: 4.2,
        p95LatencyMs: 7.3,
      },
      routes: [
        {
          path: '/api/v1/messages',
          count: 3,
          errorRateRatio: 0,
          avgLatencyMs: 3.5,
          p95LatencyMs: 5.8,
          lastStatus: 201,
          lastSeenAt: new Date().toISOString(),
        },
      ],
      mailboxMaintenance: {
        runs: 2,
        totalCleanupRemoved: 0,
        totalRetracted: 0,
        lastRunAt: new Date().toISOString(),
        lastCleanupRemoved: 0,
        lastRemaining: 0,
        lastRetracted: 0,
        staleSec: 2,
      },
      alerts: [
        {
          code: 'HTTP_5XX_RATE',
          level: 'OK',
          title: 'HTTP 5xx rate',
          value: 0,
          threshold: 0.02,
          message: 'ok',
        },
      ],
    };
  }
}

class FakeKeyLifecycleService {
  private readonly keys = new Map<string, Array<{
    did: string;
    suite: 'signal' | 'mls';
    keyId: string;
    publicKey: string;
    state: 'ACTIVE' | 'ROTATING' | 'REVOKED' | 'RECOVERED';
    createdAtMs: number;
    activatedAtMs: number;
    revokeReason?: string;
  }>>();

  registerKey(input: {
    did: string;
    suite: 'signal' | 'mls';
    keyId: string;
    publicKey: string;
    expiresAtMs?: number;
  }) {
    const record = {
      did: input.did,
      suite: input.suite,
      keyId: input.keyId,
      publicKey: input.publicKey,
      state: 'ACTIVE' as const,
      createdAtMs: Date.now(),
      activatedAtMs: Date.now(),
      expiresAtMs: input.expiresAtMs,
    };
    const bucket = this.keys.get(input.did) ?? [];
    bucket.push(record);
    this.keys.set(input.did, bucket);
    return record;
  }

  rotateKey(input: {
    did: string;
    suite: 'signal' | 'mls';
    fromKeyId: string;
    toKeyId: string;
    publicKey: string;
  }) {
    const previous = this.registerKey({
      did: input.did,
      suite: input.suite,
      keyId: input.fromKeyId,
      publicKey: '0x' + '1'.repeat(64),
    });
    const current = this.registerKey({
      did: input.did,
      suite: input.suite,
      keyId: input.toKeyId,
      publicKey: input.publicKey,
    });
    return {
      previous: {
        ...previous,
        state: 'ROTATING' as const,
      },
      current,
    };
  }

  revokeKey(input: {
    did: string;
    suite: 'signal' | 'mls';
    keyId: string;
    reason: string;
  }) {
    return {
      did: input.did,
      suite: input.suite,
      keyId: input.keyId,
      publicKey: '0x' + '1'.repeat(64),
      state: 'REVOKED' as const,
      createdAtMs: Date.now(),
      activatedAtMs: Date.now(),
      revokedAtMs: Date.now(),
      revokeReason: input.reason,
    };
  }

  recoverKey(input: {
    did: string;
    suite: 'signal' | 'mls';
    revokedKeyId: string;
    recoveredKeyId: string;
    publicKey: string;
  }) {
    return {
      revoked: {
        did: input.did,
        suite: input.suite,
        keyId: input.revokedKeyId,
        publicKey: '0x' + '1'.repeat(64),
        state: 'RECOVERED' as const,
        createdAtMs: Date.now(),
        activatedAtMs: Date.now(),
      },
      recovered: {
        did: input.did,
        suite: input.suite,
        keyId: input.recoveredKeyId,
        publicKey: input.publicKey,
        state: 'ACTIVE' as const,
        createdAtMs: Date.now(),
        activatedAtMs: Date.now(),
      },
    };
  }

  listKeys(did: string, suite?: 'signal' | 'mls') {
    const bucket = this.keys.get(did) ?? [];
    return suite ? bucket.filter((entry) => entry.suite === suite) : bucket;
  }

  assertCanUseKey() {
    return true;
  }
}

async function startTestServer() {
  const identityService = new FakeIdentityService();
  const messageService = new FakeMessageService(identityService);
  const context: RuntimeContext = {
    config: { host: '127.0.0.1', port: 0 },
    identityService: identityService as unknown as RuntimeContext['identityService'],
    groupService: new FakeGroupService() as unknown as RuntimeContext['groupService'],
    gasService: new FakeGasService() as unknown as RuntimeContext['gasService'],
    messageService: messageService as unknown as RuntimeContext['messageService'],
    attachmentService: new FakeAttachmentService() as unknown as RuntimeContext['attachmentService'],
    federationService: new FakeFederationService() as unknown as RuntimeContext['federationService'],
    monitoringService: new FakeMonitoringService() as unknown as RuntimeContext['monitoringService'],
    keyLifecycleService: new FakeKeyLifecycleService() as unknown as RuntimeContext['keyLifecycleService'],
  };

  const server = new ApiServer(context);
  await server.start();

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

test('created response returns data envelope and Location header', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const response = await fetch(`${baseUrl}/api/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      senderDid: 'did:claw:zSelf',
      conversationId: 'group:0x' + 'b'.repeat(64),
      conversationType: 'group',
      targetDomain: 'alpha.tel',
      mailboxKeyId: 'mailbox-1',
      sealedHeader: '0x11',
      ciphertext: '0x22',
      contentType: 'text',
      ttlSec: 3600,
    }),
  });

  assert.equal(response.status, 201);
  assert.match(response.headers.get('location') ?? '', /^\/api\/v1\/messages\/pull\?/);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);

  const body = (await response.json()) as {
    data: { envelope: { envelopeId: string; seq: string } };
    links: { self: string };
  };
  assert.equal(body.data.envelope.envelopeId, 'env-1');
  assert.equal(body.data.envelope.seq, '1');
  assert.match(body.links.self, /^\/api\/v1\/messages\/pull\?/);
});

test('list response returns paginated envelope shape', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const groupId = `0x${'b'.repeat(64)}`;
  const response = await fetch(`${baseUrl}/api/v1/groups/${groupId}/members?view=all&page=1&per_page=1`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    data: Array<{ did: string }>;
    meta: { pagination: { page: number; perPage: number; total: number; totalPages: number } };
    links: { self: string; first: string; last: string; prev: string | null; next: string | null };
  };

  assert.equal(body.data.length, 1);
  assert.equal(body.meta.pagination.page, 1);
  assert.equal(body.meta.pagination.perPage, 1);
  assert.equal(body.meta.pagination.total, 2);
  assert.equal(body.meta.pagination.totalPages, 2);
  assert.match(body.links.self, /\/api\/v1\/groups\/.*\/members\?/);
});

test('validation errors use RFC7807 shape and problem+json content type', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const response = await fetch(`${baseUrl}/api/v1/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json/);

  const body = (await response.json()) as {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    code: string;
  };

  assert.equal(body.status, 400);
  assert.equal(body.title, 'Bad Request');
  assert.equal(body.instance, '/api/v1/groups');
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.match(body.type, /^https:\/\/telagent\.dev\/errors\/validation-error$/);
  assert.ok(body.detail.length > 0);
});

test('node audit snapshot exports de-sensitized envelope and links.self', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const response = await fetch(`${baseUrl}/api/v1/node/audit-snapshot?sample_size=5&retraction_scan_limit=100`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as {
    data: {
      actor: { didHash: string; controllerHash: string; isActive: boolean };
      groups: {
        total: number;
        domainCount: number;
        domainSamples: Array<{ domainHash: string; groupCount: number }>;
        memberStateCounts: { PENDING: number; FINALIZED: number; REMOVED: number };
      };
      messages: {
        activeEnvelopeCount: number;
        retractedCount: number;
        sampledRetractions: Array<{ envelopeIdHash: string; conversationIdHash: string }>;
      };
      federation: {
        domainHash: string;
        security: {
          allowedSourceDomainHashes: string[];
          pinning: {
            configuredDomainCount: number;
            configuredDomainHashes: string[];
          };
        };
      };
    };
    links: { self: string };
  };

  assert.equal(body.data.groups.total, 2);
  assert.equal(body.data.groups.domainCount, 2);
  assert.equal(body.data.groups.memberStateCounts.PENDING, 2);
  assert.equal(body.data.groups.memberStateCounts.FINALIZED, 1);
  assert.equal(body.data.messages.retractedCount, 1);
  assert.equal(body.data.messages.sampledRetractions.length, 1);
  assert.equal(body.data.messages.sampledRetractions[0].envelopeIdHash.length, 64);
  assert.equal(body.data.federation.domainHash.length, 64);
  assert.equal(body.data.federation.security.pinning.configuredDomainCount, 1);
  assert.equal(body.data.federation.security.pinning.configuredDomainHashes[0].length, 64);
  assert.match(body.links.self, /^\/api\/v1\/node\/audit-snapshot\?/);

  const serialized = JSON.stringify(body.data);
  assert.equal(serialized.includes('alpha.tel'), false);
  assert.equal(serialized.includes('beta.tel'), false);
  assert.equal(serialized.includes('node-a.tel'), false);
  assert.equal(serialized.includes('env-retracted-1'), false);
  assert.equal(serialized.includes('group:0x' + 'b'.repeat(64)), false);
});

test('node audit snapshot rejects invalid query with RFC7807 response', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const response = await fetch(`${baseUrl}/api/v1/node/audit-snapshot?sample_size=0`);
  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json/);

  const body = (await response.json()) as {
    title: string;
    status: number;
    instance: string;
    code: string;
    type: string;
  };

  assert.equal(body.title, 'Bad Request');
  assert.equal(body.status, 400);
  assert.equal(body.instance, '/api/v1/node/audit-snapshot');
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.match(body.type, /^https:\/\/telagent\.dev\/errors\/validation-error$/);
});

test('TA-P12-003 revoked DID event isolates session and rejects message send with RFC7807', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const initialSend = await fetch(`${baseUrl}/api/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      senderDid: 'did:claw:zSelf',
      conversationId: 'direct:revoked-contract',
      conversationType: 'direct',
      targetDomain: 'alpha.tel',
      mailboxKeyId: 'mailbox-1',
      sealedHeader: '0x11',
      ciphertext: '0x22',
      contentType: 'text',
      ttlSec: 3600,
    }),
  });
  assert.equal(initialSend.status, 201);

  const revokeRes = await fetch(`${baseUrl}/api/v1/node/revocations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      did: 'did:claw:zSelf',
      source: 'contract-test',
    }),
  });
  assert.equal(revokeRes.status, 201);
  const revokeBody = (await revokeRes.json()) as {
    data: {
      revocation: {
        did: string;
        didHash: string;
        source: string;
      };
    };
  };
  assert.equal(revokeBody.data.revocation.did, 'did:claw:zSelf');
  assert.equal(revokeBody.data.revocation.source, 'contract-test');
  assert.equal(revokeBody.data.revocation.didHash.length, 66);

  const blockedSend = await fetch(`${baseUrl}/api/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      senderDid: 'did:claw:zSelf',
      conversationId: 'direct:revoked-contract',
      conversationType: 'direct',
      targetDomain: 'alpha.tel',
      mailboxKeyId: 'mailbox-1',
      sealedHeader: '0x11',
      ciphertext: '0x33',
      contentType: 'text',
      ttlSec: 3600,
    }),
  });

  assert.equal(blockedSend.status, 422);
  assert.match(blockedSend.headers.get('content-type') ?? '', /^application\/problem\+json/);
  const blockedBody = (await blockedSend.json()) as {
    title: string;
    status: number;
    code: string;
    type: string;
    instance: string;
  };
  assert.equal(blockedBody.title, 'Unprocessable Entity');
  assert.equal(blockedBody.status, 422);
  assert.equal(blockedBody.code, 'UNPROCESSABLE_ENTITY');
  assert.equal(blockedBody.instance, '/api/v1/messages');
  assert.match(blockedBody.type, /^https:\/\/telagent\.dev\/errors\/unprocessable-entity$/);

  const auditRes = await fetch(`${baseUrl}/api/v1/node/audit-snapshot?sample_size=5&retraction_scan_limit=100`);
  assert.equal(auditRes.status, 200);
  const auditBody = (await auditRes.json()) as {
    data: {
      messages: {
        revokedDidCount: number;
        isolatedConversationCount: number;
        isolationEventCount: number;
      };
    };
  };
  assert.equal(auditBody.data.messages.revokedDidCount, 1);
  assert.equal(auditBody.data.messages.isolatedConversationCount, 1);
  assert.equal(auditBody.data.messages.isolationEventCount, 1);
});

test('not found uses RFC7807 shape', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const response = await fetch(`${baseUrl}/api/v1/not-exist`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json/);

  const body = (await response.json()) as {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    code: string;
  };

  assert.equal(body.title, 'Not Found');
  assert.equal(body.status, 404);
  assert.equal(body.instance, '/api/v1/not-exist');
  assert.equal(body.code, 'NOT_FOUND');
  assert.match(body.type, /^https:\/\/telagent\.dev\/errors\/not-found$/);
});

test('identities and groups endpoints are accessible with expected status codes', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const groupId = `0x${'b'.repeat(64)}`;
  const inviteId = `0x${'c'.repeat(64)}`;
  const did = 'did:claw:zM2';

  const selfRes = await fetch(`${baseUrl}/api/v1/identities/self`);
  assert.equal(selfRes.status, 200);

  const nodeRes = await fetch(`${baseUrl}/api/v1/node`);
  assert.equal(nodeRes.status, 200);

  const metricsRes = await fetch(`${baseUrl}/api/v1/node/metrics`);
  assert.equal(metricsRes.status, 200);

  const resolveRes = await fetch(`${baseUrl}/api/v1/identities/${encodeURIComponent(did)}`);
  assert.equal(resolveRes.status, 200);

  const createGroupRes = await fetch(`${baseUrl}/api/v1/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      creatorDid: 'did:claw:zSelf',
      groupId,
      groupDomain: 'alpha.tel',
      domainProofHash: `0x${'3'.repeat(64)}`,
      initialMlsStateHash: `0x${'4'.repeat(64)}`,
    }),
  });
  assert.equal(createGroupRes.status, 201);

  const getGroupRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}`);
  assert.equal(getGroupRes.status, 200);

  const membersRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/members?view=all&page=1&per_page=20`);
  assert.equal(membersRes.status, 200);

  const inviteRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inviterDid: 'did:claw:zSelf',
      inviteeDid: did,
      inviteId,
      mlsCommitHash: `0x${'5'.repeat(64)}`,
    }),
  });
  assert.equal(inviteRes.status, 201);

  const acceptRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/invites/${inviteId}/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inviteeDid: did,
      mlsWelcomeHash: `0x${'6'.repeat(64)}`,
    }),
  });
  assert.equal(acceptRes.status, 201);

  const removeRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/members/${encodeURIComponent(did)}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operatorDid: 'did:claw:zSelf',
      mlsCommitHash: `0x${'7'.repeat(64)}`,
    }),
  });
  assert.equal(removeRes.status, 204);

  const chainStateRes = await fetch(`${baseUrl}/api/v1/groups/${groupId}/chain-state`);
  assert.equal(chainStateRes.status, 200);
});

test('messages, attachments and federation endpoints are accessible', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(async () => {
    await server.stop();
  });

  const pullRes = await fetch(`${baseUrl}/api/v1/messages/pull?limit=20`);
  assert.equal(pullRes.status, 200);

  const retractedRes = await fetch(`${baseUrl}/api/v1/messages/retracted?limit=20`);
  assert.equal(retractedRes.status, 200);

  const initUploadRes = await fetch(`${baseUrl}/api/v1/attachments/init-upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: 'a.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      manifestHash: `0x${'8'.repeat(64)}`,
    }),
  });
  assert.equal(initUploadRes.status, 201);

  const completeUploadRes = await fetch(`${baseUrl}/api/v1/attachments/complete-upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      objectKey: 'attachments/o1',
      manifestHash: `0x${'8'.repeat(64)}`,
      checksum: `0x${'9'.repeat(64)}`,
    }),
  });
  assert.equal(completeUploadRes.status, 200);

  const keyRegisterRes = await fetch(`${baseUrl}/api/v1/keys/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      did: 'did:claw:zSelf',
      suite: 'signal',
      keyId: 'signal-key-v1',
      publicKey: `0x${'9'.repeat(64)}`,
    }),
  });
  assert.equal(keyRegisterRes.status, 201);

  const keyRotateRes = await fetch(`${baseUrl}/api/v1/keys/rotate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      did: 'did:claw:zSelf',
      suite: 'signal',
      fromKeyId: 'signal-key-v1',
      toKeyId: 'signal-key-v2',
      publicKey: `0x${'8'.repeat(64)}`,
      gracePeriodSec: 60,
    }),
  });
  assert.equal(keyRotateRes.status, 200);

  const keyListRes = await fetch(`${baseUrl}/api/v1/keys/${encodeURIComponent('did:claw:zSelf')}?suite=signal`);
  assert.equal(keyListRes.status, 200);

  const fedEnvelopeRes = await fetch(`${baseUrl}/api/v1/federation/envelopes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelopeId: 'fed-1', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(fedEnvelopeRes.status, 201);

  const fedSyncRes = await fetch(`${baseUrl}/api/v1/federation/group-state/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ groupId: `0x${'b'.repeat(64)}`, state: 'ACTIVE', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(fedSyncRes.status, 201);

  const fedSyncInvalidVersionRes = await fetch(`${baseUrl}/api/v1/federation/group-state/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      groupId: `0x${'b'.repeat(64)}`,
      state: 'ACTIVE',
      sourceDomain: 'node-b.tel',
      stateVersion: '11',
    }),
  });
  assert.equal(fedSyncInvalidVersionRes.status, 400);

  const fedReceiptRes = await fetch(`${baseUrl}/api/v1/federation/receipts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelopeId: 'fed-1', status: 'delivered', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(fedReceiptRes.status, 201);

  const fedConflictRes = await fetch(`${baseUrl}/api/v1/federation/envelopes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelopeId: 'fed-force-error', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(fedConflictRes.status, 409);

  const dlqListRes = await fetch(`${baseUrl}/api/v1/federation/dlq?status=pending`);
  assert.equal(dlqListRes.status, 200);
  const dlqListBody = (await dlqListRes.json()) as {
    data: Array<{ dlqId: string; scope: string }>;
    meta: { pagination: { total: number } };
  };
  assert.ok(dlqListBody.meta.pagination.total >= 1);
  assert.ok(dlqListBody.data.some((entry) => entry.scope === 'envelopes'));

  const dlqReplayRes = await fetch(`${baseUrl}/api/v1/federation/dlq/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ maxItems: 1, stopOnError: true }),
  });
  assert.equal(dlqReplayRes.status, 200);
  const dlqReplayBody = (await dlqReplayRes.json()) as {
    data: { processed: number; replayed: number; failed: number };
  };
  assert.equal(dlqReplayBody.data.processed, 1);
  assert.equal(dlqReplayBody.data.replayed, 1);
  assert.equal(dlqReplayBody.data.failed, 0);

  const incompatibleProtocolRes = await fetch(`${baseUrl}/api/v1/federation/envelopes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telagent-protocol-version': 'v99',
    },
    body: JSON.stringify({ envelopeId: 'fed-2', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(incompatibleProtocolRes.status, 422);
  assert.match(incompatibleProtocolRes.headers.get('content-type') ?? '', /^application\/problem\+json/);

  const pinRequiredNoHeaderRes = await fetch(`${baseUrl}/api/v1/federation/envelopes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ envelopeId: 'fed-pin-required', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(pinRequiredNoHeaderRes.status, 401);

  const pinRequiredWithHeaderRes = await fetch(`${baseUrl}/api/v1/federation/envelopes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telagent-source-key-id': 'node-b-key-v1',
    },
    body: JSON.stringify({ envelopeId: 'fed-pin-required', sourceDomain: 'node-b.tel' }),
  });
  assert.equal(pinRequiredWithHeaderRes.status, 201);

  const nodeInfoRes = await fetch(`${baseUrl}/api/v1/federation/node-info`);
  assert.equal(nodeInfoRes.status, 200);
});
