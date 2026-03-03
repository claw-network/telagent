import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { keccak256, toUtf8Bytes } from 'ethers';

import {
  AgentDidSchema,
  ErrorCodes,
  InitAttachmentSchema,
  TelagentError,
  hashDid,
  isDidClaw,
  type AgentDID,
} from '@telagent/protocol';

import { ApiServer } from '../src/api/server.js';
import type { RuntimeContext } from '../src/api/types.js';
import { FederationService } from '../src/services/federation-service.js';
import { NodeMonitoringService } from '../src/services/node-monitoring-service.js';

type Severity = 'critical' | 'high' | 'medium';
type CheckStatus = 'PASS' | 'FAIL';

interface SecurityCheckResult {
  id: string;
  title: string;
  severity: Severity;
  status: CheckStatus;
  evidence: string[];
  details: Record<string, unknown>;
}

interface SecurityReviewReport {
  phase: 'Phase 5';
  taskId: 'TA-P5-004';
  generatedAt: string;
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    criticalOpenCount: number;
    highRiskOpenCount: number;
  };
  decision: 'PASS' | 'FAIL';
  checks: SecurityCheckResult[];
}

class FakeIdentityService {
  async getSelf() {
    return {
      did: 'did:claw:zSelf',
      didHash: `0x${'1'.repeat(64)}`,
      controller: `0x${'1'.repeat(40)}`,
      publicKey: '0x11',
      isActive: true,
      resolvedAtMs: Date.now(),
    };
  }

  async resolve(did: string) {
    return {
      did,
      didHash: `0x${'2'.repeat(64)}`,
      controller: `0x${'2'.repeat(40)}`,
      publicKey: '0x22',
      isActive: true,
      resolvedAtMs: Date.now(),
    };
  }
}

class FakeGroupService {
  createGroup() {
    throw new Error('not used');
  }

  inviteMember() {
    throw new Error('not used');
  }

  acceptInvite() {
    throw new Error('not used');
  }

  removeMember() {
    throw new Error('not used');
  }

  getGroup(groupId: string) {
    return {
      groupId,
      creatorDid: 'did:claw:zSelf',
      creatorDidHash: `0x${'1'.repeat(64)}`,
      groupDomain: 'alpha.tel',
      domainProofHash: `0x${'3'.repeat(64)}`,
      initialMlsStateHash: `0x${'4'.repeat(64)}`,
      state: 'ACTIVE',
      createdAtMs: Date.now(),
      txHash: `0x${'5'.repeat(64)}`,
      blockNumber: 100,
    };
  }

  listMembers() {
    return [];
  }

  getChainState(groupId: string) {
    return {
      groupId,
      state: 'ACTIVE',
      finalizedTxHash: `0x${'5'.repeat(64)}`,
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
    return 1_000_000n;
  }
}

class FakeMessageService {
  send() {
    throw new Error('not used');
  }

  pull() {
    return { items: [], nextCursor: null };
  }
}

class FakeAttachmentService {
  initUpload() {
    return {
      objectKey: 'attachments/o1',
      uploadUrl: 'https://uploads.example.test/attachments%2Fo1',
      expiresInSec: 900,
    };
  }

  completeUpload() {
    return {
      objectKey: 'attachments/o1',
      manifestHash: `0x${'6'.repeat(64)}`,
      checksum: `0x${'7'.repeat(64)}`,
      completedAtMs: Date.now(),
    };
  }
}

function telagentCodeOf(error: unknown): string {
  if (error instanceof TelagentError) {
    return error.code;
  }
  return error instanceof Error ? error.name : 'UNKNOWN';
}

function ensure(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function startSecurityReviewServer(): Promise<{ server: ApiServer; baseUrl: string }> {
  const runtime: RuntimeContext = {
    config: { host: '127.0.0.1', port: 0 },
    identityService: new FakeIdentityService() as unknown as RuntimeContext['identityService'],
    groupService: new FakeGroupService() as unknown as RuntimeContext['groupService'],
    gasService: new FakeGasService() as unknown as RuntimeContext['gasService'],
    messageService: new FakeMessageService() as unknown as RuntimeContext['messageService'],
    attachmentService: new FakeAttachmentService() as unknown as RuntimeContext['attachmentService'],
    federationService: new FederationService({
      selfDomain: 'node-a.tel',
      authToken: 'security-check-token',
      allowedSourceDomains: ['node-b.tel'],
      envelopeRateLimitPerMinute: 10,
      groupStateSyncRateLimitPerMinute: 10,
      receiptRateLimitPerMinute: 10,
    }) as unknown as RuntimeContext['federationService'],
    monitoringService: new NodeMonitoringService(),
  };

  const server = new ApiServer(runtime);
  await server.start();

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP address for security review server');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function checkApiPrefixEnforced(): Promise<Record<string, unknown>> {
  const { server, baseUrl } = await startSecurityReviewServer();
  try {
    const apiResponse = await fetch(`${baseUrl}/api/v1/node`);
    ensure(apiResponse.status === 200, 'GET /api/v1/node should return 200');

    const legacyResponse = await fetch(`${baseUrl}/v1/node`);
    ensure(legacyResponse.status === 404, 'GET /v1/node should return 404');
    ensure(
      (legacyResponse.headers.get('content-type') ?? '').startsWith('application/problem+json'),
      'legacy prefix response should be application/problem+json',
    );

    const problemBody = (await legacyResponse.json()) as { code?: string; instance?: string };
    ensure(problemBody.code === ErrorCodes.NOT_FOUND, 'legacy prefix should map to NOT_FOUND');
    ensure(problemBody.instance === '/v1/node', 'legacy prefix instance should be /v1/node');

    return {
      apiStatus: apiResponse.status,
      legacyStatus: legacyResponse.status,
      legacyProblemCode: problemBody.code,
    };
  } finally {
    await server.stop();
  }
}

async function checkRfc7807ValidationError(): Promise<Record<string, unknown>> {
  const { server, baseUrl } = await startSecurityReviewServer();
  try {
    const response = await fetch(`${baseUrl}/api/v1/groups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    ensure(response.status === 400, 'POST /api/v1/groups invalid body should return 400');
    ensure(
      (response.headers.get('content-type') ?? '').startsWith('application/problem+json'),
      'validation response should be application/problem+json',
    );

    const problem = (await response.json()) as {
      type?: string;
      title?: string;
      status?: number;
      detail?: string;
      instance?: string;
      code?: string;
    };

    ensure(problem.status === 400, 'problem.status should be 400');
    ensure(problem.code === ErrorCodes.VALIDATION, 'problem.code should be VALIDATION_ERROR');
    ensure(
      typeof problem.type === 'string' && problem.type.startsWith('https://telagent.dev/errors/'),
      'problem.type should use telagent.dev/errors namespace',
    );
    ensure(problem.instance === '/api/v1/groups', 'problem.instance should match request path');

    return {
      status: response.status,
      code: problem.code,
      type: problem.type,
    };
  } finally {
    await server.stop();
  }
}

function checkDidNamespaceGuard(): Record<string, unknown> {
  const validDidResult = AgentDidSchema.safeParse('did:claw:zAgent2026');
  const invalidDidResult = AgentDidSchema.safeParse('did:example:agent2026');

  ensure(validDidResult.success, 'did:claw DID should pass AgentDidSchema');
  ensure(!invalidDidResult.success, 'non did:claw DID should fail AgentDidSchema');
  ensure(isDidClaw('did:claw:zAgent2026'), 'isDidClaw should accept did:claw');
  ensure(!isDidClaw('did:web:agent2026'), 'isDidClaw should reject non did:claw');

  return {
    validAccepted: validDidResult.success,
    invalidAccepted: invalidDidResult.success,
  };
}

function checkDidHashRule(): Record<string, unknown> {
  const sampleDid = 'did:claw:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as AgentDID;
  const actual = hashDid(sampleDid);
  const expected = keccak256(toUtf8Bytes(sampleDid));
  const referenceVector = '0x0da4c0771cb08ebf5576a598d16d7b1a84065bba02de475e6ea53b6539556d35';

  ensure(actual === expected, 'hashDid must match keccak256(utf8(did))');
  ensure(actual === referenceVector, 'hashDid must match locked reference vector');

  return {
    sampleDid,
    didHash: actual,
  };
}

function checkAttachmentLimit(): Record<string, unknown> {
  const accepted = InitAttachmentSchema.safeParse({
    filename: 'safe.bin',
    contentType: 'application/octet-stream',
    sizeBytes: 50 * 1024 * 1024,
    manifestHash: `0x${'8'.repeat(64)}`,
  });
  const rejected = InitAttachmentSchema.safeParse({
    filename: 'oversize.bin',
    contentType: 'application/octet-stream',
    sizeBytes: 50 * 1024 * 1024 + 1,
    manifestHash: `0x${'9'.repeat(64)}`,
  });

  ensure(accepted.success, '50MB attachment should be allowed');
  ensure(!rejected.success, 'attachment larger than 50MB should be rejected');

  return {
    acceptedAtBoundary: accepted.success,
    rejectedAboveBoundary: !rejected.success,
  };
}

function checkFederationAuthAndAllowlist(): Record<string, unknown> {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    authToken: 'phase5-token',
    allowedSourceDomains: ['node-b.tel'],
    envelopeRateLimitPerMinute: 10,
    groupStateSyncRateLimitPerMinute: 10,
    receiptRateLimitPerMinute: 10,
  });

  let unauthorizedCode = '';
  let forbiddenCode = '';

  try {
    service.receiveEnvelope({ envelopeId: 'env-1', payload: 'x' }, { sourceDomain: 'node-b.tel' });
  } catch (error) {
    unauthorizedCode = telagentCodeOf(error);
  }

  try {
    service.receiveEnvelope(
      { envelopeId: 'env-2', payload: 'x' },
      { sourceDomain: 'node-c.tel', authToken: 'phase5-token' },
    );
  } catch (error) {
    forbiddenCode = telagentCodeOf(error);
  }

  const accepted = service.receiveEnvelope(
    { envelopeId: 'env-3', payload: 'x' },
    { sourceDomain: 'node-b.tel', authToken: 'phase5-token' },
  );

  ensure(unauthorizedCode === ErrorCodes.UNAUTHORIZED, 'missing federation token should be UNAUTHORIZED');
  ensure(forbiddenCode === ErrorCodes.FORBIDDEN, 'unknown sourceDomain should be FORBIDDEN');
  ensure(accepted.accepted, 'valid federation envelope should be accepted');

  return {
    unauthorizedCode,
    forbiddenCode,
    accepted: accepted.accepted,
  };
}

function checkFederationRateLimit(): Record<string, unknown> {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    authToken: 'phase5-token',
    allowedSourceDomains: ['node-b.tel'],
    envelopeRateLimitPerMinute: 2,
    groupStateSyncRateLimitPerMinute: 1,
    receiptRateLimitPerMinute: 2,
  });

  service.receiveEnvelope({ envelopeId: 'env-1' }, { sourceDomain: 'node-b.tel', authToken: 'phase5-token' });
  service.receiveEnvelope({ envelopeId: 'env-2' }, { sourceDomain: 'node-b.tel', authToken: 'phase5-token' });

  let rateLimitCode = '';
  try {
    service.receiveEnvelope({ envelopeId: 'env-3' }, { sourceDomain: 'node-b.tel', authToken: 'phase5-token' });
  } catch (error) {
    rateLimitCode = telagentCodeOf(error);
  }

  ensure(
    rateLimitCode === ErrorCodes.TOO_MANY_REQUESTS,
    'envelope rate limit should raise TOO_MANY_REQUESTS when exceeded',
  );

  return {
    rateLimitCode,
    allowedPerMinute: 2,
  };
}

function checkGroupDomainConsistency(): Record<string, unknown> {
  const service = new FederationService({
    selfDomain: 'node-a.tel',
    authToken: 'phase5-token',
    allowedSourceDomains: ['node-b.tel'],
  });

  let mismatchCode = '';
  try {
    service.syncGroupState(
      {
        groupId: `0x${'a'.repeat(64)}`,
        state: 'ACTIVE',
        groupDomain: 'node-c.tel',
      },
      { sourceDomain: 'node-b.tel', authToken: 'phase5-token' },
    );
  } catch (error) {
    mismatchCode = telagentCodeOf(error);
  }

  const accepted = service.syncGroupState(
    {
      groupId: `0x${'b'.repeat(64)}`,
      state: 'ACTIVE',
      groupDomain: 'node-b.tel',
    },
    { sourceDomain: 'node-b.tel', authToken: 'phase5-token' },
  );

  ensure(mismatchCode === ErrorCodes.FORBIDDEN, 'groupDomain mismatch should be FORBIDDEN');
  ensure(accepted.synced, 'matched groupDomain should be accepted');

  return {
    mismatchCode,
    accepted: accepted.synced,
  };
}

async function checkGasPreflightGuards(repoRoot: string): Promise<Record<string, unknown>> {
  const sourcePath = path.resolve(repoRoot, 'packages/node/src/services/group-service.ts');
  const source = await fs.readFile(sourcePath, 'utf8');
  const assertMatches = source.match(/this\.gasService\.assertSufficient\(preflight\);/g) ?? [];
  const preflightMatches = source.match(/this\.gasService\.preflight\(\{/g) ?? [];

  ensure(
    assertMatches.length === 4,
    `group-service should assert gas sufficiency in 4 lifecycle methods, got ${assertMatches.length}`,
  );
  ensure(
    preflightMatches.length === 4,
    `group-service should preflight gas in 4 lifecycle methods, got ${preflightMatches.length}`,
  );

  return {
    preflightCalls: preflightMatches.length,
    assertCalls: assertMatches.length,
    sourcePath,
  };
}

async function checkAlertRuleBaseline(repoRoot: string): Promise<Record<string, unknown>> {
  const alertRulesPath = path.resolve(
    repoRoot,
    'docs/implementation/phase-5/manifests/2026-03-03-p5-alert-rules.yaml',
  );
  const raw = await fs.readFile(alertRulesPath, 'utf8');
  const requiredCodes = ['HTTP_5XX_RATE', 'HTTP_P95_LATENCY', 'MAILBOX_MAINTENANCE_STALE'];
  for (const code of requiredCodes) {
    ensure(raw.includes(code), `alert rules baseline must include ${code}`);
  }

  return {
    alertRulesPath,
    requiredCodes,
  };
}

async function runCheck(
  check: {
    id: string;
    title: string;
    severity: Severity;
    evidence: string[];
    run: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  },
): Promise<SecurityCheckResult> {
  try {
    const details = await check.run();
    return {
      id: check.id,
      title: check.title,
      severity: check.severity,
      status: 'PASS',
      evidence: check.evidence,
      details,
    };
  } catch (error) {
    return {
      id: check.id,
      title: check.title,
      severity: check.severity,
      status: 'FAIL',
      evidence: check.evidence,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath =
    process.env.P5_SECURITY_REVIEW_OUTPUT_PATH ??
    path.resolve(repoRoot, 'docs/implementation/phase-5/manifests/2026-03-03-p5-security-review.json');

  const checks = await Promise.all([
    runCheck({
      id: 'SEC-P5-001',
      title: 'API 前缀仅开放 /api/v1/*',
      severity: 'critical',
      evidence: ['packages/node/src/api/server.ts', 'packages/node/src/api-prefix.test.ts'],
      run: () => checkApiPrefixEnforced(),
    }),
    runCheck({
      id: 'SEC-P5-002',
      title: '错误响应符合 RFC7807 + telagent.dev/errors 命名空间',
      severity: 'critical',
      evidence: [
        'packages/node/src/api/response.ts',
        'packages/protocol/src/errors.ts',
        'packages/node/src/api-contract.test.ts',
      ],
      run: () => checkRfc7807ValidationError(),
    }),
    runCheck({
      id: 'SEC-P5-003',
      title: 'DID 命名空间仅接受 did:claw:*',
      severity: 'critical',
      evidence: ['packages/protocol/src/schema.ts', 'packages/protocol/src/hash.ts'],
      run: () => checkDidNamespaceGuard(),
    }),
    runCheck({
      id: 'SEC-P5-004',
      title: 'DID hash 固定为 keccak256(utf8(did))',
      severity: 'critical',
      evidence: ['packages/protocol/src/hash.ts'],
      run: () => checkDidHashRule(),
    }),
    runCheck({
      id: 'SEC-P5-005',
      title: '附件大小上限 50MB 生效',
      severity: 'high',
      evidence: ['packages/protocol/src/schema.ts', 'packages/node/src/services/attachment-service.ts'],
      run: () => checkAttachmentLimit(),
    }),
    runCheck({
      id: 'SEC-P5-006',
      title: '联邦鉴权与来源域名白名单强制执行',
      severity: 'critical',
      evidence: ['packages/node/src/services/federation-service.ts', 'packages/node/src/api/routes/federation.ts'],
      run: () => checkFederationAuthAndAllowlist(),
    }),
    runCheck({
      id: 'SEC-P5-007',
      title: '联邦接口限流策略生效',
      severity: 'high',
      evidence: ['packages/node/src/services/federation-service.ts'],
      run: () => checkFederationRateLimit(),
    }),
    runCheck({
      id: 'SEC-P5-008',
      title: 'groupDomain 与 sourceDomain 一致性校验生效',
      severity: 'high',
      evidence: ['packages/node/src/services/federation-service.ts', 'packages/node/src/api/routes/federation.ts'],
      run: () => checkGroupDomainConsistency(),
    }),
    runCheck({
      id: 'SEC-P5-009',
      title: '链上写操作执行前必须完成 gas 预检与余额断言',
      severity: 'high',
      evidence: ['packages/node/src/services/group-service.ts', 'packages/node/src/services/gas-service.ts'],
      run: () => checkGasPreflightGuards(repoRoot),
    }),
    runCheck({
      id: 'SEC-P5-010',
      title: '监控告警基线覆盖关键安全运营指标',
      severity: 'medium',
      evidence: ['docs/implementation/phase-5/manifests/2026-03-03-p5-alert-rules.yaml'],
      run: () => checkAlertRuleBaseline(repoRoot),
    }),
  ]);

  const passedChecks = checks.filter((check) => check.status === 'PASS').length;
  const failedChecks = checks.length - passedChecks;
  const criticalOpenCount = checks.filter((check) => check.status === 'FAIL' && check.severity === 'critical').length;
  const highRiskOpenCount = checks.filter((check) => check.status === 'FAIL' && check.severity !== 'medium').length;

  const report: SecurityReviewReport = {
    phase: 'Phase 5',
    taskId: 'TA-P5-004',
    generatedAt: new Date().toISOString(),
    summary: {
      totalChecks: checks.length,
      passedChecks,
      failedChecks,
      criticalOpenCount,
      highRiskOpenCount,
    },
    decision: highRiskOpenCount === 0 ? 'PASS' : 'FAIL',
    checks,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P5-004] security checks: ${passedChecks}/${checks.length} PASS`);
  console.log(
    `[TA-P5-004] criticalOpenCount=${criticalOpenCount} highRiskOpenCount=${highRiskOpenCount} decision=${report.decision}`,
  );
  console.log(`[TA-P5-004] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Security review failed: high risk items remain open');
  }
}

main().catch((error) => {
  console.error('[TA-P5-004] security review execution failed');
  console.error(error);
  process.exitCode = 1;
});
