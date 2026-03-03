import assert from 'node:assert/strict';
import test from 'node:test';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import {
  DomainProofChallengeService,
  hashDomainProofDocument,
  type DomainProofDocument,
} from './domain-proof-challenge-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface JsonResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
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

function createJsonResponse(payload: unknown, status = 200): JsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    async json() {
      return payload;
    },
  };
}

function bytes32(fill: string): string {
  return `0x${fill.repeat(64)}`;
}

test('TA-P11-003 accepts valid domain proof challenge and canonical hash', async () => {
  const clock = createClock();
  const groupId = bytes32('1');
  const creatorDid = 'did:claw:zAlice';
  const groupDomain = 'alpha.tel';
  const proofUrl = `https://${groupDomain}/.well-known/telagent/group-proof/${groupId}.json`;
  const nodeInfoUrl = `https://${groupDomain}/api/v1/federation/node-info`;

  const proofDocument: DomainProofDocument = {
    groupId,
    groupDomain,
    creatorDid,
    nodeInfoUrl,
    issuedAt: new Date(clock.now() - 5_000).toISOString(),
    expiresAt: new Date(clock.now() + 300_000).toISOString(),
    nonce: 'nonce-v1',
    signature: '0x' + 'a'.repeat(130),
  };
  const domainProofHash = hashDomainProofDocument(proofDocument);

  const service = new DomainProofChallengeService({
    clock,
    fetcher: async (input) => {
      if (input === proofUrl) {
        return createJsonResponse(proofDocument);
      }
      if (input === nodeInfoUrl) {
        return createJsonResponse({
          data: {
            domain: groupDomain,
          },
        });
      }
      return createJsonResponse({ message: 'not found' }, 404);
    },
  });

  const result = await service.validateForCreateGroup({
    groupId,
    groupDomain,
    creatorDid,
    domainProofHash,
  });

  assert.equal(result.enforced, true);
  assert.equal(result.passed, true);
  assert.equal(result.rotated, false);
  assert.equal(result.computedDomainProofHash, domainProofHash);
  assert.ok(result.challengeId);
});

test('TA-P11-003 rejects illegal domain challenge on malformed domain', async () => {
  const service = new DomainProofChallengeService({
    fetcher: async () => createJsonResponse({ message: 'unreachable' }, 404),
  });

  await assert.rejects(
    async () => {
      await service.validateForCreateGroup({
        groupId: bytes32('2'),
        groupDomain: 'bad domain',
        creatorDid: 'did:claw:zAlice',
        domainProofHash: bytes32('3'),
      });
    },
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.VALIDATION);
      return true;
    },
  );
});

test('TA-P11-003 rejects when canonical domainProofHash mismatches payload', async () => {
  const clock = createClock();
  const groupId = bytes32('4');
  const creatorDid = 'did:claw:zAlice';
  const groupDomain = 'mismatch.tel';
  const proofUrl = `https://${groupDomain}/.well-known/telagent/group-proof/${groupId}.json`;
  const nodeInfoUrl = `https://${groupDomain}/api/v1/federation/node-info`;

  const proofDocument: DomainProofDocument = {
    groupId,
    groupDomain,
    creatorDid,
    nodeInfoUrl,
    issuedAt: new Date(clock.now() - 3_000).toISOString(),
    expiresAt: new Date(clock.now() + 120_000).toISOString(),
    nonce: 'nonce-v1',
    signature: '0x' + 'b'.repeat(130),
  };

  const service = new DomainProofChallengeService({
    clock,
    fetcher: async (input) => {
      if (input === proofUrl) {
        return createJsonResponse(proofDocument);
      }
      if (input === nodeInfoUrl) {
        return createJsonResponse({
          data: {
            domain: groupDomain,
          },
        });
      }
      return createJsonResponse({ message: 'not found' }, 404);
    },
  });

  await assert.rejects(
    async () => {
      await service.validateForCreateGroup({
        groupId,
        groupDomain,
        creatorDid,
        domainProofHash: bytes32('f'),
      });
    },
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.CONFLICT);
      return true;
    },
  );
});

test('TA-P11-003 rotates challenge nonce near expiry and accepts renewed domain proof', async () => {
  const clock = createClock();
  const groupId = bytes32('5');
  const creatorDid = 'did:claw:zBob';
  const groupDomain = 'rotation.tel';
  const proofUrl = `https://${groupDomain}/.well-known/telagent/group-proof/${groupId}.json`;
  const nodeInfoUrl = `https://${groupDomain}/api/v1/federation/node-info`;

  let proofDocument: DomainProofDocument = {
    groupId,
    groupDomain,
    creatorDid,
    nodeInfoUrl,
    issuedAt: new Date(clock.now() - 3_000).toISOString(),
    expiresAt: new Date(clock.now() + 120_000).toISOString(),
    nonce: 'nonce-v1',
    signature: '0x' + 'c'.repeat(130),
  };

  const service = new DomainProofChallengeService({
    clock,
    rotateBeforeExpirySec: 60,
    fetcher: async (input) => {
      if (input === proofUrl) {
        return createJsonResponse(proofDocument);
      }
      if (input === nodeInfoUrl) {
        return createJsonResponse({
          data: {
            domain: groupDomain,
          },
        });
      }
      return createJsonResponse({ message: 'not found' }, 404);
    },
  });

  await service.validateForCreateGroup({
    groupId,
    groupDomain,
    creatorDid,
    domainProofHash: hashDomainProofDocument(proofDocument),
  });

  clock.tick(70_000);
  await assert.rejects(
    async () => {
      await service.validateForCreateGroup({
        groupId,
        groupDomain,
        creatorDid,
        domainProofHash: hashDomainProofDocument(proofDocument),
      });
    },
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.UNPROCESSABLE);
      return true;
    },
  );

  proofDocument = {
    ...proofDocument,
    nonce: 'nonce-v2',
    issuedAt: new Date(clock.now() - 1_000).toISOString(),
    expiresAt: new Date(clock.now() + 300_000).toISOString(),
  };
  const renewedResult = await service.validateForCreateGroup({
    groupId,
    groupDomain,
    creatorDid,
    domainProofHash: hashDomainProofDocument(proofDocument),
  });

  assert.equal(renewedResult.passed, true);
  assert.equal(renewedResult.rotated, true);
});

test('TA-P11-003 report-only mode returns warning without blocking create flow', async () => {
  const service = new DomainProofChallengeService({
    enforcementMode: 'report-only',
    fetcher: async () => createJsonResponse({ message: 'unreachable' }, 502),
  });

  const result = await service.validateForCreateGroup({
    groupId: bytes32('6'),
    groupDomain: 'warning.tel',
    creatorDid: 'did:claw:zAlice',
    domainProofHash: bytes32('6'),
  });

  assert.equal(result.enforced, false);
  assert.equal(result.passed, false);
  assert.match(result.warning ?? '', /failed/i);
});
