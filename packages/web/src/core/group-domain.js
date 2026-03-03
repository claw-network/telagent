import { isDidClaw } from './api-client.js';

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function isBytes32Hex(value) {
  return typeof value === 'string' && BYTES32_PATTERN.test(value.trim());
}

export function normalizeMembersView(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'all';
  if (normalized === 'pending' || normalized === 'finalized') {
    return normalized;
  }
  return 'all';
}

export function createGroupDiagnosticsState() {
  return {
    groupId: '',
    membersView: 'all',
    members: [],
    pagination: null,
    chainState: null,
    lastSyncedAt: null,
    lastError: null,
    lastAction: null,
  };
}

export function validateCreateGroupInput(input) {
  const errors = [];
  if (!isDidClaw(input?.creatorDid)) {
    errors.push('creator did must match did:claw:*');
  }
  if (!isBytes32Hex(input?.groupId)) {
    errors.push('group id must be bytes32 hex');
  }
  if (typeof input?.groupDomain !== 'string' || !input.groupDomain.trim()) {
    errors.push('group domain is required');
  }
  if (!isBytes32Hex(input?.domainProofHash)) {
    errors.push('domain proof hash must be bytes32 hex');
  }
  if (!isBytes32Hex(input?.initialMlsStateHash)) {
    errors.push('initial mls hash must be bytes32 hex');
  }
  return errors;
}

export function validateInviteInput(input) {
  const errors = [];
  if (!isBytes32Hex(input?.groupId)) {
    errors.push('group id must be bytes32 hex');
  }
  if (!isBytes32Hex(input?.inviteId)) {
    errors.push('invite id must be bytes32 hex');
  }
  if (!isDidClaw(input?.inviterDid)) {
    errors.push('inviter did must match did:claw:*');
  }
  if (!isDidClaw(input?.inviteeDid)) {
    errors.push('invitee did must match did:claw:*');
  }
  if (!isBytes32Hex(input?.mlsCommitHash)) {
    errors.push('invite mls commit hash must be bytes32 hex');
  }
  return errors;
}

export function validateAcceptInviteInput(input) {
  const errors = [];
  if (!isBytes32Hex(input?.groupId)) {
    errors.push('group id must be bytes32 hex');
  }
  if (!isBytes32Hex(input?.inviteId)) {
    errors.push('invite id must be bytes32 hex');
  }
  if (!isDidClaw(input?.inviteeDid)) {
    errors.push('invitee did must match did:claw:*');
  }
  if (!isBytes32Hex(input?.mlsWelcomeHash)) {
    errors.push('accept mls welcome hash must be bytes32 hex');
  }
  return errors;
}

export function summarizeMembersByState(members) {
  const summary = {
    total: 0,
    pending: 0,
    finalized: 0,
    removed: 0,
    unknown: 0,
  };

  for (const item of Array.isArray(members) ? members : []) {
    summary.total += 1;
    const state = String(item?.state || '').toUpperCase();
    if (state === 'PENDING') {
      summary.pending += 1;
      continue;
    }
    if (state === 'FINALIZED') {
      summary.finalized += 1;
      continue;
    }
    if (state === 'REMOVED') {
      summary.removed += 1;
      continue;
    }
    summary.unknown += 1;
  }

  return summary;
}

export function formatValidationErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return '';
  }
  return errors.join('; ');
}
