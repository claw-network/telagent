import { describe, expect, it } from 'vitest';

import {
  createGroupDiagnosticsState,
  formatValidationErrors,
  isBytes32Hex,
  normalizeMembersView,
  summarizeMembersByState,
  validateAcceptInviteInput,
  validateCreateGroupInput,
  validateInviteInput,
} from './group-domain';

const BYTES32 = `0x${'ab'.repeat(32)}`;

describe('group-domain', () => {
  it('isBytes32Hex validates bytes32 hex', () => {
    expect(isBytes32Hex(BYTES32)).toBe(true);
    expect(isBytes32Hex('0x1234')).toBe(false);
  });

  it('normalizeMembersView accepts all/pending/finalized', () => {
    expect(normalizeMembersView('all')).toBe('all');
    expect(normalizeMembersView('pending')).toBe('pending');
    expect(normalizeMembersView('finalized')).toBe('finalized');
    expect(normalizeMembersView('other')).toBe('all');
  });

  it('validateCreateGroupInput returns empty errors for valid payload', () => {
    const errors = validateCreateGroupInput({
      creatorDid: 'did:claw:zAlice',
      groupId: BYTES32,
      groupDomain: 'alpha.tel',
      domainProofHash: BYTES32,
      initialMlsStateHash: BYTES32,
    });
    expect(errors).toEqual([]);
  });

  it('validateInviteInput and validateAcceptInviteInput catch invalid fields', () => {
    const inviteErrors = validateInviteInput({
      groupId: '0x1',
      inviteId: '0x2',
      inviterDid: 'did:key:zAlice',
      inviteeDid: 'did:key:zBob',
      mlsCommitHash: '0x3',
    });
    expect(inviteErrors.length).toBeGreaterThanOrEqual(3);

    const acceptErrors = validateAcceptInviteInput({
      groupId: '0x1',
      inviteId: '0x2',
      inviteeDid: 'did:key:zBob',
      mlsWelcomeHash: '0x3',
    });
    expect(acceptErrors.length).toBeGreaterThanOrEqual(3);
  });

  it('summarizeMembersByState counts state buckets', () => {
    expect(
      summarizeMembersByState([
        { state: 'PENDING' },
        { state: 'FINALIZED' },
        { state: 'FINALIZED' },
        { state: 'REMOVED' },
        { state: 'UNKNOWN' },
      ]),
    ).toEqual({
      total: 5,
      pending: 1,
      finalized: 2,
      removed: 1,
      unknown: 1,
    });
  });

  it('createGroupDiagnosticsState and formatValidationErrors defaults', () => {
    const runtime = createGroupDiagnosticsState();
    expect(runtime.membersView).toBe('all');
    expect(runtime.members).toEqual([]);
    expect(formatValidationErrors([])).toBe('');
    expect(formatValidationErrors(['a', 'b'])).toBe('a; b');
  });
});
