import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import {
  DomainProofChallengeService,
  hashDomainProofDocument,
  type DomainProofDocument,
} from '../src/services/domain-proof-challenge-service.js';

interface Phase11DomainProofReport {
  phase: 'Phase 11';
  taskId: 'TA-P11-003';
  generatedAt: string;
  summary: {
    illegalDomainRejected: boolean;
    validChallengeAccepted: boolean;
    staleNonceRejected: boolean;
    rotatedNonceAccepted: boolean;
    canonicalHashMatched: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

function createClock(startMs = 1_700_000_000_000): MutableClock {
  let current = startMs;
  return {
    now() {
      return current;
    },
    tick(ms: number) {
      current += ms;
    },
  };
}

function bytes32(fill: string): string {
  return `0x${fill.repeat(64)}`;
}

function asTelagentError(error: unknown): TelagentError {
  if (!(error instanceof TelagentError)) {
    throw new Error(`expected TelagentError, got ${String(error)}`);
  }
  return error;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P11_DOMAIN_PROOF_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-11/manifests/2026-03-03-p11-domain-proof-challenge-check.json');

  const clock = createClock();
  const groupId = bytes32('a');
  const creatorDid = 'did:claw:zPhase11';
  const groupDomain = 'phase11.tel';
  const proofUrl = `https://${groupDomain}/.well-known/telagent/group-proof/${groupId}.json`;
  const nodeInfoUrl = `https://${groupDomain}/api/v1/federation/node-info`;

  let proofDocument: DomainProofDocument = {
    groupId,
    groupDomain,
    creatorDid,
    nodeInfoUrl,
    issuedAt: new Date(clock.now() - 2_000).toISOString(),
    expiresAt: new Date(clock.now() + 120_000).toISOString(),
    nonce: 'nonce-v1',
    signature: `0x${'d'.repeat(130)}`,
  };

  const service = new DomainProofChallengeService({
    clock,
    rotateBeforeExpirySec: 60,
    fetcher: async (input) => {
      if (input === proofUrl) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return proofDocument;
          },
        };
      }

      if (input === nodeInfoUrl) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          async json() {
            return {
              data: {
                domain: groupDomain,
              },
            };
          },
        };
      }

      return {
        ok: false,
        status: 404,
        statusText: 'NOT_FOUND',
        async json() {
          return { message: 'not found' };
        },
      };
    },
  });

  let illegalDomainRejected = false;
  let illegalDomainErrorCode: string | null = null;
  try {
    await service.validateForCreateGroup({
      groupId,
      groupDomain: 'invalid domain',
      creatorDid,
      domainProofHash: bytes32('0'),
    });
  } catch (error) {
    const typed = asTelagentError(error);
    illegalDomainRejected = typed.code === ErrorCodes.VALIDATION;
    illegalDomainErrorCode = typed.code;
  }

  const firstHash = hashDomainProofDocument(proofDocument);
  const initialResult = await service.validateForCreateGroup({
    groupId,
    groupDomain,
    creatorDid,
    domainProofHash: firstHash,
  });

  const validChallengeAccepted = initialResult.passed && initialResult.challengeId !== undefined;
  const canonicalHashMatched = initialResult.computedDomainProofHash === firstHash;

  clock.tick(70_000);
  let staleNonceRejected = false;
  let staleNonceErrorCode: string | null = null;
  try {
    await service.validateForCreateGroup({
      groupId,
      groupDomain,
      creatorDid,
      domainProofHash: firstHash,
    });
  } catch (error) {
    const typed = asTelagentError(error);
    staleNonceRejected = typed.code === ErrorCodes.UNPROCESSABLE;
    staleNonceErrorCode = typed.code;
  }

  proofDocument = {
    ...proofDocument,
    nonce: 'nonce-v2',
    issuedAt: new Date(clock.now() - 1_000).toISOString(),
    expiresAt: new Date(clock.now() + 300_000).toISOString(),
  };
  const rotatedHash = hashDomainProofDocument(proofDocument);
  const rotatedResult = await service.validateForCreateGroup({
    groupId,
    groupDomain,
    creatorDid,
    domainProofHash: rotatedHash,
  });
  const rotatedNonceAccepted = rotatedResult.passed && rotatedResult.rotated;

  const report: Phase11DomainProofReport = {
    phase: 'Phase 11',
    taskId: 'TA-P11-003',
    generatedAt: new Date().toISOString(),
    summary: {
      illegalDomainRejected,
      validChallengeAccepted,
      staleNonceRejected,
      rotatedNonceAccepted,
      canonicalHashMatched,
    },
    decision:
      illegalDomainRejected
        && validChallengeAccepted
        && staleNonceRejected
        && rotatedNonceAccepted
        && canonicalHashMatched
        ? 'PASS'
        : 'FAIL',
    details: {
      groupId,
      groupDomain,
      firstChallengeId: initialResult.challengeId,
      rotatedChallengeId: rotatedResult.challengeId,
      firstHash,
      rotatedHash,
      illegalDomainErrorCode,
      staleNonceErrorCode,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P11-003] illegalDomainRejected=${illegalDomainRejected} validChallengeAccepted=${validChallengeAccepted}`);
  console.log(`[TA-P11-003] staleNonceRejected=${staleNonceRejected} rotatedNonceAccepted=${rotatedNonceAccepted}`);
  console.log(`[TA-P11-003] decision=${report.decision}`);
  console.log(`[TA-P11-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 11 DomainProof challenge check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P11-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});
