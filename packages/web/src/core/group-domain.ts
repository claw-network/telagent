import { isDidClaw } from './api-client';

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export interface GroupDiagnosticsState {
  groupId: string;
  membersView: 'all' | 'pending' | 'finalized';
  members: Array<Record<string, unknown>>;
  pagination: { page: number; perPage: number; total: number; totalPages: number } | null;
  chainState: Record<string, unknown> | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastAction: string | null;
}

export function isBytes32Hex(value: unknown): value is string {
  return typeof value === 'string' && BYTES32_PATTERN.test(value.trim());
}

export function normalizeMembersView(value: unknown): 'all' | 'pending' | 'finalized' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'all';
  if (normalized === 'pending' || normalized === 'finalized') {
    return normalized;
  }
  return 'all';
}

export function createGroupDiagnosticsState(): GroupDiagnosticsState {
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

export function validateCreateGroupInput(input: {
  creatorDid: string;
  groupId: string;
  groupDomain: string;
  domainProofHash: string;
  initialMlsStateHash: string;
}): string[] {
  const errors: string[] = [];
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

export function validateInviteInput(input: {
  groupId: string;
  inviteId: string;
  inviterDid: string;
  inviteeDid: string;
  mlsCommitHash: string;
}): string[] {
  const errors: string[] = [];
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

export function validateAcceptInviteInput(input: {
  groupId: string;
  inviteId: string;
  inviteeDid: string;
  mlsWelcomeHash: string;
}): string[] {
  const errors: string[] = [];
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

export function summarizeMembersByState(members: Array<Record<string, unknown>>) {
  const summary = {
    total: 0,
    pending: 0,
    finalized: 0,
    removed: 0,
    unknown: 0,
  };

  for (const item of members) {
    summary.total += 1;
    const state = String(item?.state ?? '').toUpperCase();
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

export function formatValidationErrors(errors: string[]): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return '';
  }
  return errors.join('; ');
}
