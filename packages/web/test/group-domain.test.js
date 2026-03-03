import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGroupDiagnosticsState,
  formatValidationErrors,
  isBytes32Hex,
  normalizeMembersView,
  summarizeMembersByState,
  validateAcceptInviteInput,
  validateCreateGroupInput,
  validateInviteInput,
} from '../src/core/group-domain.js';

const BYTES32 = `0x${'ab'.repeat(32)}`;

test('isBytes32Hex validates bytes32 hex', () => {
  assert.equal(isBytes32Hex(BYTES32), true);
  assert.equal(isBytes32Hex('0x1234'), false);
  assert.equal(isBytes32Hex('not-hex'), false);
});

test('normalizeMembersView accepts all/pending/finalized', () => {
  assert.equal(normalizeMembersView('all'), 'all');
  assert.equal(normalizeMembersView('pending'), 'pending');
  assert.equal(normalizeMembersView('finalized'), 'finalized');
  assert.equal(normalizeMembersView('invalid-view'), 'all');
});

test('validateCreateGroupInput returns empty errors for valid payload', () => {
  const errors = validateCreateGroupInput({
    creatorDid: 'did:claw:zAlice',
    groupId: BYTES32,
    groupDomain: 'alpha.tel',
    domainProofHash: BYTES32,
    initialMlsStateHash: BYTES32,
  });
  assert.deepEqual(errors, []);
});

test('validateInviteInput and validateAcceptInviteInput catch invalid fields', () => {
  const inviteErrors = validateInviteInput({
    groupId: '0x1',
    inviteId: '0x2',
    inviterDid: 'did:key:zAlice',
    inviteeDid: 'did:key:zBob',
    mlsCommitHash: '0x3',
  });
  assert.equal(inviteErrors.length >= 3, true);

  const acceptErrors = validateAcceptInviteInput({
    groupId: '0x1',
    inviteId: '0x2',
    inviteeDid: 'did:key:zBob',
    mlsWelcomeHash: '0x3',
  });
  assert.equal(acceptErrors.length >= 3, true);
});

test('summarizeMembersByState counts state buckets', () => {
  const summary = summarizeMembersByState([
    { state: 'PENDING' },
    { state: 'FINALIZED' },
    { state: 'FINALIZED' },
    { state: 'REMOVED' },
    { state: 'UNKNOWN' },
  ]);

  assert.deepEqual(summary, {
    total: 5,
    pending: 1,
    finalized: 2,
    removed: 1,
    unknown: 1,
  });
});

test('createGroupDiagnosticsState and formatValidationErrors defaults', () => {
  const runtime = createGroupDiagnosticsState();
  assert.equal(runtime.membersView, 'all');
  assert.deepEqual(runtime.members, []);
  assert.equal(formatValidationErrors([]), '');
  assert.equal(formatValidationErrors(['a', 'b']), 'a; b');
});
