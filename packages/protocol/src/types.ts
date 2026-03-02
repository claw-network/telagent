export type AgentDID = string;

export type GroupID = string;
export type InviteID = string;

export type GroupState = 'PENDING_ONCHAIN' | 'ACTIVE' | 'REORGED_BACK';
export type MembershipState = 'PENDING' | 'FINALIZED' | 'REMOVED';

export type ConversationType = 'direct' | 'group';
export type ContentType = 'text' | 'image' | 'file' | 'control';

export interface RouteHint {
  targetDomain: string;
  mailboxKeyId: string;
}

export interface Envelope {
  envelopeId: string;
  conversationId: string;
  conversationType: ConversationType;
  routeHint: RouteHint;
  sealedHeader: string;
  seq: bigint;
  epoch?: number;
  ciphertext: string;
  contentType: ContentType;
  attachmentManifestHash?: string;
  sentAtMs: number;
  ttlSec: number;
  provisional?: boolean;
}

export interface GroupRecord {
  groupId: GroupID;
  creatorDid: AgentDID;
  creatorDidHash: string;
  groupDomain: string;
  domainProofHash: string;
  initialMlsStateHash: string;
  state: GroupState;
  createdAtMs: number;
  txHash?: string;
  blockNumber?: number;
}

export interface GroupMemberRecord {
  groupId: GroupID;
  did: AgentDID;
  didHash: string;
  state: MembershipState;
  joinedAtMs: number;
  inviteId?: InviteID;
  txHash?: string;
}

export interface GroupChainState {
  groupId: GroupID;
  state: GroupState;
  pendingTxHash?: string;
  finalizedTxHash?: string;
  blockNumber?: number;
  updatedAtMs: number;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
}
