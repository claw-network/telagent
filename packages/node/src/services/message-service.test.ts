import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ErrorCodes, TelagentError, hashDid, type GroupState } from '@telagent/protocol';

import { MessageService } from './message-service.js';
import { MessageRepository } from '../storage/message-repository.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

function createClock(startMs = 1_000_000): MutableClock {
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

function createMessageService(startMs?: number) {
  const clock = createClock(startMs);
  const groups = {} as ConstructorParameters<typeof MessageService>[0];
  const service = new MessageService(groups, { clock });
  return { service, clock };
}

function createGroupHarness() {
  const stateByGroup = new Map<string, GroupState>();
  const membersByGroup = new Map<string, Array<{ didHash: string; state: 'PENDING' | 'FINALIZED' | 'REMOVED' }>>();

  const groups = {
    getChainState(groupId: string) {
      const state = stateByGroup.get(groupId);
      if (!state) {
        throw new Error(`group(${groupId}) not found`);
      }
      return {
        groupId,
        state,
        updatedAtMs: Date.now(),
      };
    },
    listMembers(groupId: string) {
      return (membersByGroup.get(groupId) ?? []).map((member) => ({
        groupId,
        did: `did:claw:${member.didHash.slice(2, 10)}`,
        didHash: member.didHash,
        state: member.state,
        joinedAtMs: Date.now(),
      }));
    },
  } as unknown as ConstructorParameters<typeof MessageService>[0];

  return {
    groups,
    setGroupState(groupId: string, state: GroupState) {
      stateByGroup.set(groupId, state);
    },
    setMemberState(groupId: string, did: string, state: 'PENDING' | 'FINALIZED' | 'REMOVED') {
      const members = membersByGroup.get(groupId) ?? [];
      const didHash = hashDid(did);
      const nextMembers = members.filter((member) => member.didHash !== didHash);
      nextMembers.push({ didHash, state });
      membersByGroup.set(groupId, nextMembers);
    },
  };
}

function createGroupMessageService(groupId: string, state: GroupState, startMs?: number) {
  const clock = createClock(startMs);
  const harness = createGroupHarness();
  harness.setGroupState(groupId, state);
  harness.setMemberState(groupId, 'did:claw:zAlice', 'FINALIZED');

  const service = new MessageService(harness.groups, { clock });
  return {
    service,
    clock,
    setGroupState(nextState: GroupState) {
      harness.setGroupState(groupId, nextState);
    },
  };
}

function createDirectInput(overrides: Partial<Parameters<MessageService['send']>[0]> = {}) {
  return {
    envelopeId: 'env-base',
    senderDid: 'did:claw:zAlice',
    conversationId: 'direct:alice-bob',
    conversationType: 'direct' as const,
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-1',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text' as const,
    ttlSec: 60,
    ...overrides,
  };
}

test('TA-P4-002 sequence allocator keeps per-conversation monotonic order', () => {
  const { service } = createMessageService();

  const first = service.send(createDirectInput({ envelopeId: 'env-a1', conversationId: 'direct:a' }));
  const second = service.send(createDirectInput({ envelopeId: 'env-a2', conversationId: 'direct:a' }));
  const third = service.send(createDirectInput({ envelopeId: 'env-b1', conversationId: 'direct:b' }));

  assert.equal(first.seq, 1n);
  assert.equal(second.seq, 2n);
  assert.equal(third.seq, 1n);
});

test('TA-P4-003 dedupe keeps idempotent writes for same envelopeId', () => {
  const { service } = createMessageService();
  const input = createDirectInput({ envelopeId: 'env-dedupe-1', conversationId: 'direct:a' });

  const first = service.send(input);
  const second = service.send({ ...input });

  assert.equal(first.envelopeId, 'env-dedupe-1');
  assert.equal(second.envelopeId, first.envelopeId);
  assert.equal(second.seq, first.seq);

  const pulled = service.pull({ conversationId: 'direct:a', limit: 20 });
  assert.equal(pulled.items.length, 1);
});

test('TA-P4-003 duplicate envelopeId with different payload is rejected', () => {
  const { service } = createMessageService();
  const input = createDirectInput({ envelopeId: 'env-dedupe-2', conversationId: 'direct:a' });
  service.send(input);

  assert.throws(
    () =>
      service.send({
        ...input,
        ciphertext: '0x33',
      }),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.CONFLICT);
      return true;
    },
  );
});

test('TA-P4-004 cleanupExpired removes expired envelopes and releases dedupe key', () => {
  const { service, clock } = createMessageService(1_000);

  const expiredInput = createDirectInput({
    envelopeId: 'env-expired',
    conversationId: 'direct:ttl',
    ttlSec: 1,
  });
  const longLivedInput = createDirectInput({
    envelopeId: 'env-active',
    conversationId: 'direct:ttl',
    ttlSec: 100,
  });

  const first = service.send(expiredInput);
  assert.equal(first.seq, 1n);
  clock.tick(400);
  service.send(longLivedInput);

  clock.tick(1_100);
  const report = service.cleanupExpired();
  assert.equal(report.removed, 1);
  assert.equal(report.remaining, 1);

  const pulled = service.pull({ conversationId: 'direct:ttl', limit: 20 });
  assert.equal(pulled.items.length, 1);
  assert.equal(pulled.items[0].envelopeId, 'env-active');

  const resent = service.send({
    ...expiredInput,
    ttlSec: 20,
    ciphertext: '0x44',
  });
  assert.equal(resent.envelopeId, 'env-expired');
  assert.equal(resent.seq, 3n);
});

test('TA-P4-005 provisional envelopes are retracted when group is reorged back', () => {
  const groupId = `0x${'a'.repeat(64)}`;
  const { service, setGroupState } = createGroupMessageService(groupId, 'PENDING_ONCHAIN', 5_000);

  const envelope = service.send({
    envelopeId: 'env-provisional-1',
    senderDid: 'did:claw:zAlice',
    conversationId: `group:${groupId}`,
    conversationType: 'group',
    targetDomain: 'alpha.tel',
    mailboxKeyId: 'mailbox-1',
    sealedHeader: '0x11',
    ciphertext: '0x22',
    contentType: 'text',
    ttlSec: 3600,
  });

  assert.equal(envelope.provisional, true);
  assert.equal(service.pull({ conversationId: `group:${groupId}` }).items.length, 1);

  setGroupState('REORGED_BACK');
  const afterReorg = service.pull({ conversationId: `group:${groupId}` });
  assert.equal(afterReorg.items.length, 0);

  const retracted = service.listRetracted();
  assert.equal(retracted.length, 1);
  assert.equal(retracted[0].envelopeId, 'env-provisional-1');
  assert.equal(retracted[0].reason, 'REORGED_BACK');
});

test('TA-P4-005 send is rejected when group chain state is REORGED_BACK', () => {
  const groupId = `0x${'b'.repeat(64)}`;
  const { service } = createGroupMessageService(groupId, 'REORGED_BACK', 9_000);

  assert.throws(
    () =>
      service.send({
        envelopeId: 'env-provisional-2',
        senderDid: 'did:claw:zAlice',
        conversationId: `group:${groupId}`,
        conversationType: 'group',
        targetDomain: 'alpha.tel',
        mailboxKeyId: 'mailbox-1',
        sealedHeader: '0x11',
        ciphertext: '0x22',
        contentType: 'text',
        ttlSec: 3600,
      }),
    (error) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.CONFLICT);
      assert.match(error.message, /REORGED_BACK/);
      return true;
    },
  );
});

test('TA-P6-001 mailbox persists messages and seq after service restart', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telagent-p6-mailbox-'));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const dbPath = path.join(tempDir, 'mailbox.sqlite');
  const clock = createClock(30_000);
  const groups = {} as ConstructorParameters<typeof MessageService>[0];

  const repoA = new MessageRepository(dbPath);
  const firstService = new MessageService(groups, { clock, repository: repoA });
  const first = firstService.send(createDirectInput({
    envelopeId: 'env-persist-1',
    conversationId: 'direct:persist',
  }));
  assert.equal(first.seq, 1n);

  const repoB = new MessageRepository(dbPath);
  const secondService = new MessageService(groups, { clock, repository: repoB });
  const pulled = secondService.pull({
    conversationId: 'direct:persist',
    limit: 10,
  });

  assert.equal(pulled.items.length, 1);
  assert.equal(pulled.items[0].envelopeId, 'env-persist-1');
  assert.equal(pulled.items[0].seq, 1n);

  const second = secondService.send(createDirectInput({
    envelopeId: 'env-persist-2',
    conversationId: 'direct:persist',
  }));
  assert.equal(second.seq, 2n);
});
