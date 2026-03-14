import type {
  AgentDID,
  Contact,
  ConversationSummary,
  CreateContactInput,
  CreateConversationInput,
  Envelope,
  GroupChainState,
  GroupMemberRecord,
  GroupRecord,
  OwnerPermissions,
  PeerProfile,
  ProblemDetail,
  RedactedEnvelope,
  SelfProfile,
  UpdateContactInput,
} from '@telagent/protocol';

export interface ApiLinks {
  self?: string;
  next?: string | null;
  prev?: string | null;
  first?: string | null;
  last?: string | null;
  [key: string]: string | null | undefined;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface ApiDataEnvelope<T> {
  data: T;
  links?: ApiLinks;
}

export interface ApiListEnvelope<T> {
  data: T[];
  meta: {
    pagination: PaginationMeta;
  };
  links: ApiLinks;
}

export interface CreateGroupInput {
  creatorDid: AgentDID;
  groupId: string;
  groupDomain: string;
  domainProofHash: string;
  initialMlsStateHash: string;
}

export interface InviteMemberInput {
  inviterDid: AgentDID;
  inviteeDid: AgentDID;
  inviteId: string;
  mlsCommitHash: string;
}

export interface AcceptInviteInput {
  inviteeDid: AgentDID;
  mlsWelcomeHash: string;
}

export interface RemoveMemberInput {
  operatorDid: AgentDID;
  memberDid: AgentDID;
  mlsCommitHash: string;
}

export interface SendMessageInput {
  envelopeId?: string;
  senderDid: AgentDID;
  conversationId: string;
  conversationType: 'direct' | 'group';
  targetDomain?: string;
  targetDid: AgentDID;
  mailboxKeyId: string;
  sealedHeader: string;
  ciphertext: string;
  contentType: 'text' | 'image' | 'file' | 'control';
  attachmentManifestHash?: string;
  epoch?: number;
  ttlSec?: number;
}

export interface PullMessageInput {
  cursor?: string;
  limit?: number;
  conversationId?: string;
}

export interface InitAttachmentUploadInput {
  filename: string;
  contentType: string;
  sizeBytes: number;
  manifestHash: string;
}

export interface CompleteAttachmentUploadInput {
  objectKey: string;
  manifestHash: string;
  checksum: string;
  fileContentType?: string;
  /** When set, the node will relay the attachment to this DID via ClawNet P2P. */
  targetDid?: string;
}

export interface GroupMemberListInput {
  view?: 'all' | 'pending' | 'finalized';
  page?: number;
  perPage?: number;
}

export interface ConversationListInput {
  page?: number;
  perPage?: number;
  sort?: 'last_message';
}

export type SessionOperationScope = 'transfer' | 'escrow' | 'market' | 'contract' | 'reputation' | 'identity';

export interface UnlockSessionInput {
  passphrase: string;
  ttlSeconds?: number;
  scope?: SessionOperationScope[];
  maxOperations?: number;
}

export interface SessionInfo {
  active: boolean;
  expiresAt: string;
  scope: SessionOperationScope[];
  operationsUsed: number;
  createdAt: string;
}

export interface SessionUnlockResult {
  sessionToken: string;
  expiresAt: string;
  scope: SessionOperationScope[];
  did: string;
  permissions: {
    mode: 'observer' | 'intervener';
    interventionScopes: string[];
  };
}

export interface WalletHistoryInput {
  did?: AgentDID;
  limit?: number;
  offset?: number;
}

export interface SearchMarketsInput {
  q?: string;
  type?: string;
}

export interface PublishTaskInput {
  title: string;
  description: string;
  budget: number;
  tags?: string[];
}

export interface BidTaskInput {
  amount: number;
  proposal?: string;
}

export interface ReviewInput {
  targetDid: AgentDID;
  score: number;
  comment?: string;
  orderId?: string;
}

// ── Info Market ─────────────────────────────────────────────────────────────

export interface PublishInfoInput {
  title: string;
  description: string;
  price: number;
  tags?: string[];
}

export interface DeliverInput {
  content?: string;
  contentHash?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

// ── Capability Market ───────────────────────────────────────────────────────

export interface PublishCapabilityInput {
  title: string;
  description: string;
  pricePerInvocation: number;
  maxConcurrentLeases?: number;
  tags?: string[];
}

export interface LeaseCapabilityInput {
  maxInvocations?: number;
  durationSeconds?: number;
}

export interface InvokeCapabilityInput {
  payload: Record<string, unknown>;
}

// ── Disputes ────────────────────────────────────────────────────────────────

export interface OpenDisputeInput {
  orderId: string;
  reason: string;
  evidence?: string;
}

export interface RespondDisputeInput {
  response: string;
  evidence?: string;
}

export interface ResolveDisputeInput {
  outcome: 'refund' | 'release' | 'split';
  splitRatio?: number;
  reason?: string;
}

export interface TransferInput {
  to: AgentDID;
  amount: number;
  memo?: string;
}

export interface CreateEscrowInput {
  beneficiary: AgentDID;
  amount: number;
  releaseRules?: unknown[];
}

export interface TelagentSdkOptions {
  baseUrl: string;
  accessToken?: string;
  fetchImpl?: typeof fetch;
  defaultHeaders?: Record<string, string>;
}

export class TelagentSdkError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail;

  constructor(problem: ProblemDetail) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
    this.status = problem.status;
  }
}

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  authToken?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('TelagentSdk requires a non-empty baseUrl');
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function hydrateEnvelope(raw: unknown): Envelope {
  if (!isRecord(raw)) {
    throw new Error('Envelope payload must be an object');
  }

  const seqRaw = raw.seq;
  let seq: bigint;
  if (typeof seqRaw === 'bigint') {
    seq = seqRaw;
  } else if (typeof seqRaw === 'string' && /^[0-9]+$/.test(seqRaw)) {
    seq = BigInt(seqRaw);
  } else if (typeof seqRaw === 'number' && Number.isFinite(seqRaw) && Number.isInteger(seqRaw) && seqRaw >= 0) {
    seq = BigInt(seqRaw);
  } else {
    throw new Error('Envelope seq must be a non-negative integer encoded as string/number/bigint');
  }

  return {
    ...(raw as Omit<Envelope, 'seq'>),
    seq,
  };
}

export class TelagentSdk {
  private readonly baseUrl: string;
  private readonly accessToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: TelagentSdkOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.accessToken = options.accessToken;
    const fetchFn = options.fetchImpl ?? fetch;
    this.fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => fetchFn(input, init);
    this.defaultHeaders = {
      accept: 'application/json',
      ...(options.defaultHeaders ?? {}),
    };
  }

  async getSelfIdentity(): Promise<AgentIdentityView> {
    const envelope = await this.requestData<AgentIdentityView>('GET', '/api/v1/identities/self');
    return envelope.data;
  }

  async getIdentity(did: AgentDID): Promise<AgentIdentityView> {
    const envelope = await this.requestData<AgentIdentityView>('GET', `/api/v1/identities/${encodeURIComponent(did)}`);
    return envelope.data;
  }

  async getOwnerPermissions(): Promise<OwnerPermissions> {
    const envelope = await this.requestData<OwnerPermissions>('GET', '/api/v1/owner/permissions');
    return envelope.data;
  }

  async listConversations(input: ConversationListInput = {}): Promise<ApiListEnvelope<ConversationSummary>> {
    const query: Record<string, QueryValue> = {
      page: input.page,
      per_page: input.perPage,
      sort: input.sort ?? 'last_message',
    };
    return this.requestList<ConversationSummary>('GET', '/api/v1/conversations', undefined, query);
  }

  async setConversationPrivacy(
    conversationId: string,
    isPrivate: boolean,
  ): Promise<{ conversationId: string; private: boolean; updatedAtMs: number }> {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
      throw new Error('conversationId is required');
    }
    const envelope = await this.requestData<{ conversationId: string; private: boolean; updatedAtMs: number }>(
      'PUT',
      `/api/v1/conversations/${encodeURIComponent(normalizedConversationId)}/privacy`,
      { private: isPrivate },
    );
    return envelope.data;
  }

  async createConversation(input: CreateConversationInput): Promise<ConversationSummary> {
    const envelope = await this.requestData<ConversationSummary>('POST', '/api/v1/conversations', input);
    return envelope.data;
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.requestNoContent('DELETE', `/api/v1/conversations/${encodeURIComponent(conversationId)}`);
  }

  async listContacts(): Promise<Contact[]> {
    const envelope = await this.requestData<Contact[]>('GET', '/api/v1/contacts');
    return envelope.data;
  }

  async addContact(input: CreateContactInput): Promise<Contact> {
    const envelope = await this.requestData<Contact>('POST', '/api/v1/contacts', input);
    return envelope.data;
  }

  async updateContact(did: AgentDID, input: UpdateContactInput): Promise<Contact> {
    const envelope = await this.requestData<Contact>('PUT', `/api/v1/contacts/${encodeURIComponent(did)}`, input);
    return envelope.data;
  }

  async removeContact(did: AgentDID): Promise<void> {
    await this.requestNoContent('DELETE', `/api/v1/contacts/${encodeURIComponent(did)}`);
  }

  // ── Self profile ────────────────────────────────────────────────────────────

  async getSelfProfile(): Promise<SelfProfile> {
    const envelope = await this.requestData<SelfProfile>('GET', '/api/v1/profile');
    return envelope.data;
  }

  async updateSelfProfile(input: Partial<Pick<SelfProfile, 'nickname' | 'avatarUrl' | 'nodeUrl'>>): Promise<SelfProfile> {
    const envelope = await this.requestData<SelfProfile>('PUT', '/api/v1/profile', input);
    return envelope.data;
  }

  async uploadSelfAvatar(data: string, mimeType: string): Promise<{ avatarUrl: string }> {
    const envelope = await this.requestData<{ avatarUrl: string }>('POST', '/api/v1/profile/avatar', { data, mimeType });
    return envelope.data;
  }

  async getPeerProfile(did: AgentDID): Promise<PeerProfile | null> {
    try {
      const envelope = await this.requestData<PeerProfile>('GET', `/api/v1/profile/${encodeURIComponent(did)}`);
      return envelope.data;
    } catch (err) {
      if (err instanceof TelagentSdkError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async createGroup(input: CreateGroupInput): Promise<{ txHash?: string; group: GroupRecord }> {
    const envelope = await this.requestData<{ txHash?: string; group: GroupRecord }>('POST', '/api/v1/groups', input);
    return envelope.data;
  }

  async getGroup(groupId: string): Promise<GroupRecord> {
    const envelope = await this.requestData<GroupRecord>('GET', `/api/v1/groups/${groupId}`);
    return envelope.data;
  }

  async listGroupMembers(groupId: string, input: GroupMemberListInput = {}): Promise<ApiListEnvelope<GroupMemberRecord>> {
    const query: Record<string, QueryValue> = {
      view: input.view ?? 'all',
      page: input.page,
      per_page: input.perPage,
    };
    const envelope = await this.requestList<GroupMemberRecord>('GET', `/api/v1/groups/${groupId}/members`, undefined, query);
    return envelope;
  }

  async inviteMember(groupId: string, input: InviteMemberInput): Promise<{ txHash?: string; inviteId: string; groupId: string }> {
    const envelope = await this.requestData<{ txHash?: string; inviteId: string; groupId: string }>(
      'POST',
      `/api/v1/groups/${groupId}/invites`,
      input,
    );
    return envelope.data;
  }

  async acceptInvite(groupId: string, inviteId: string, input: AcceptInviteInput): Promise<{ txHash?: string; groupId: string; inviteId: string }> {
    const envelope = await this.requestData<{ txHash?: string; groupId: string; inviteId: string }>(
      'POST',
      `/api/v1/groups/${groupId}/invites/${inviteId}/accept`,
      input,
    );
    return envelope.data;
  }

  async removeMember(groupId: string, memberDid: AgentDID, input: RemoveMemberInput): Promise<void> {
    await this.requestNoContent('DELETE', `/api/v1/groups/${groupId}/members/${encodeURIComponent(memberDid)}`, input);
  }

  async getGroupChainState(groupId: string): Promise<GroupChainState> {
    const envelope = await this.requestData<GroupChainState>('GET', `/api/v1/groups/${groupId}/chain-state`);
    return envelope.data;
  }

  async sendMessage(input: SendMessageInput): Promise<Envelope> {
    const envelope = await this.requestData<{ envelope: Envelope }>('POST', '/api/v1/messages', input);
    return hydrateEnvelope(envelope.data.envelope);
  }

  async pullMessages(input: PullMessageInput = {}): Promise<{ items: Envelope[]; cursor: string | null }> {
    const query: Record<string, QueryValue> = {
      cursor: input.cursor,
      limit: input.limit,
      conversation_id: input.conversationId,
    };
    const envelope = await this.requestData<{ items: Envelope[]; cursor: string | null }>('GET', '/api/v1/messages/pull', undefined, query);
    return {
      items: envelope.data.items.map((item) => hydrateEnvelope(item)),
      cursor: envelope.data.cursor,
    };
  }

  /**
   * Fetch messages via the Owner view endpoint.
   * Owner tokens receive redacted envelopes (ciphertext/sealedHeader replaced).
   * Agent tokens receive full envelopes.
   */
  async viewMessages(input: PullMessageInput = {}): Promise<{ items: (Envelope | RedactedEnvelope)[]; cursor: string | null }> {
    const query: Record<string, QueryValue> = {
      cursor: input.cursor,
      limit: input.limit,
      conversation_id: input.conversationId,
    };
    const envelope = await this.requestData<{ items: (Envelope | RedactedEnvelope)[]; cursor: string | null }>('GET', '/api/v1/messages/view', undefined, query);
    return {
      items: envelope.data.items.map((item) =>
        item.ciphertext === '[redacted]' ? item : hydrateEnvelope(item as Envelope),
      ),
      cursor: envelope.data.cursor,
    };
  }

  async initAttachmentUpload(input: InitAttachmentUploadInput): Promise<{
    objectKey: string;
    uploadUrl: string;
    expiresAtMs: number;
    manifestHash: string;
    checksumAlgorithm: 'sha256';
  }> {
    const envelope = await this.requestData<{
      objectKey: string;
      uploadUrl: string;
      expiresAtMs: number;
      manifestHash: string;
      checksumAlgorithm: 'sha256';
    }>('POST', '/api/v1/attachments/init-upload', input);
    return envelope.data;
  }

  async completeAttachmentUpload(input: CompleteAttachmentUploadInput): Promise<{
    objectKey: string;
    manifestHash: string;
    checksum: string;
    completedAtMs: number;
    status: 'ready';
  }> {
    const envelope = await this.requestData<{
      objectKey: string;
      manifestHash: string;
      checksum: string;
      completedAtMs: number;
      status: 'ready';
    }>('POST', '/api/v1/attachments/complete-upload', input);
    return envelope.data;
  }

  async unlockSession(input: UnlockSessionInput): Promise<SessionUnlockResult> {
    const envelope = await this.requestData<SessionUnlockResult>('POST', '/api/v1/session/unlock', input);
    return envelope.data;
  }

  async lockSession(sessionToken: string): Promise<void> {
    await this.requestNoContent('POST', '/api/v1/session/lock', undefined, undefined, {
      authToken: sessionToken,
    });
  }

  async getSessionInfo(sessionToken: string): Promise<SessionInfo> {
    const envelope = await this.requestData<SessionInfo>('GET', '/api/v1/session', undefined, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  async getWalletBalance(did?: AgentDID): Promise<unknown> {
    const path = did
      ? `/api/v1/clawnet/wallet/balance/${encodeURIComponent(did)}`
      : '/api/v1/clawnet/wallet/balance';
    const envelope = await this.requestData<unknown>('GET', path);
    return envelope.data;
  }

  async getWalletNonce(did?: AgentDID): Promise<unknown> {
    const path = did
      ? `/api/v1/clawnet/wallet/nonce/${encodeURIComponent(did)}`
      : '/api/v1/clawnet/wallet/nonce';
    const envelope = await this.requestData<unknown>('GET', path);
    return envelope.data;
  }

  async getWalletHistory(input: WalletHistoryInput = {}): Promise<unknown[]> {
    const path = input.did
      ? `/api/v1/clawnet/wallet/history/${encodeURIComponent(input.did)}`
      : '/api/v1/clawnet/wallet/history';
    const query: Record<string, QueryValue> = {
      limit: input.limit,
      offset: input.offset,
    };
    const envelope = await this.requestData<unknown[]>('GET', path, undefined, query);
    return envelope.data;
  }

  async getClawnetSelfIdentity(): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', '/api/v1/clawnet/identity/self');
    return envelope.data;
  }

  async getClawnetIdentity(did: AgentDID): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', `/api/v1/clawnet/identity/${encodeURIComponent(did)}`);
    return envelope.data;
  }

  async getAgentProfile(did: AgentDID): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', `/api/v1/clawnet/profile/${encodeURIComponent(did)}`);
    return envelope.data;
  }

  async getReputation(did: AgentDID): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', `/api/v1/clawnet/reputation/${encodeURIComponent(did)}`);
    return envelope.data;
  }

  async getClawnetHealth(): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', '/api/v1/clawnet/health');
    return envelope.data;
  }

  async getEscrow(escrowId: string): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', `/api/v1/clawnet/escrow/${encodeURIComponent(escrowId)}`);
    return envelope.data;
  }

  async listTasks(filters?: Record<string, QueryValue>): Promise<unknown[]> {
    const envelope = await this.requestData<unknown[]>('GET', '/api/v1/clawnet/market/tasks', undefined, filters);
    return envelope.data;
  }

  async searchMarkets(input: SearchMarketsInput = {}): Promise<unknown[]> {
    const query: Record<string, QueryValue> = {
      q: input.q,
      type: input.type,
    };
    const envelope = await this.requestData<unknown[]>('GET', '/api/v1/clawnet/markets/search', undefined, query);
    return envelope.data;
  }

  async listTaskBids(taskId: string): Promise<unknown[]> {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) {
      throw new Error('taskId is required');
    }
    const envelope = await this.requestData<unknown[]>(
      'GET',
      `/api/v1/clawnet/market/tasks/${encodeURIComponent(normalizedTaskId)}/bids`,
    );
    return envelope.data;
  }

  async transfer(sessionToken: string, input: TransferInput): Promise<unknown> {
    const envelope = await this.requestData<unknown>('POST', '/api/v1/clawnet/wallet/transfer', input, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  async createEscrow(sessionToken: string, input: CreateEscrowInput): Promise<unknown> {
    const envelope = await this.requestData<unknown>('POST', '/api/v1/clawnet/wallet/escrow', input, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  async releaseEscrow(sessionToken: string, escrowId: string): Promise<unknown> {
    const normalizedEscrowId = escrowId.trim();
    if (!normalizedEscrowId) {
      throw new Error('escrowId is required');
    }
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/wallet/escrow/${encodeURIComponent(normalizedEscrowId)}/release`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async publishTask(sessionToken: string, input: PublishTaskInput): Promise<unknown> {
    const envelope = await this.requestData<unknown>('POST', '/api/v1/clawnet/market/tasks', input, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  async bid(sessionToken: string, taskId: string, input: BidTaskInput): Promise<unknown> {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) {
      throw new Error('taskId is required');
    }
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/tasks/${encodeURIComponent(normalizedTaskId)}/bid`,
      input,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async acceptBid(sessionToken: string, taskId: string, bidId: string): Promise<unknown> {
    const normalizedTaskId = taskId.trim();
    const normalizedBidId = bidId.trim();
    if (!normalizedTaskId) {
      throw new Error('taskId is required');
    }
    if (!normalizedBidId) {
      throw new Error('bidId is required');
    }
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/tasks/${encodeURIComponent(normalizedTaskId)}/accept-bid`,
      { bidId: normalizedBidId },
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async submitReview(sessionToken: string, input: ReviewInput): Promise<unknown> {
    const envelope = await this.requestData<unknown>('POST', '/api/v1/clawnet/reputation/review', input, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  async createServiceContract(sessionToken: string, payload: Record<string, unknown>): Promise<unknown> {
    const envelope = await this.requestData<unknown>('POST', '/api/v1/clawnet/contracts', payload, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  // ── Info Market ───────────────────────────────────────────────────────────

  async listInfoListings(filters?: Record<string, QueryValue>): Promise<unknown[]> {
    const envelope = await this.requestData<unknown[]>('GET', '/api/v1/clawnet/market/info', undefined, filters);
    return envelope.data;
  }

  async getInfoListing(id: string): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', `/api/v1/clawnet/market/info/${encodeURIComponent(id)}`);
    return envelope.data;
  }

  async publishInfo(sessionToken: string, input: PublishInfoInput): Promise<unknown> {
    const envelope = await this.requestData<unknown>('POST', '/api/v1/clawnet/market/info', input, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  async purchaseInfo(sessionToken: string, id: string): Promise<unknown> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('id is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/info/${encodeURIComponent(normalizedId)}/purchase`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async deliverInfo(sessionToken: string, id: string, input: DeliverInput): Promise<unknown> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('id is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/info/${encodeURIComponent(normalizedId)}/deliver`,
      input,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async confirmInfo(sessionToken: string, id: string): Promise<unknown> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('id is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/info/${encodeURIComponent(normalizedId)}/confirm`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async subscribeInfo(sessionToken: string, id: string): Promise<unknown> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('id is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/info/${encodeURIComponent(normalizedId)}/subscribe`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async unsubscribeInfo(sessionToken: string, id: string): Promise<unknown> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('id is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/info/${encodeURIComponent(normalizedId)}/unsubscribe`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  // ── Capability Market ─────────────────────────────────────────────────────

  async listCapabilities(filters?: Record<string, QueryValue>): Promise<unknown[]> {
    const envelope = await this.requestData<unknown[]>('GET', '/api/v1/clawnet/market/capabilities', undefined, filters);
    return envelope.data;
  }

  async getCapability(id: string): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', `/api/v1/clawnet/market/capabilities/${encodeURIComponent(id)}`);
    return envelope.data;
  }

  async publishCapability(sessionToken: string, input: PublishCapabilityInput): Promise<unknown> {
    const envelope = await this.requestData<unknown>('POST', '/api/v1/clawnet/market/capabilities', input, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  async leaseCapability(sessionToken: string, id: string, input: LeaseCapabilityInput = {}): Promise<unknown> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('id is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/capabilities/${encodeURIComponent(normalizedId)}/lease`,
      input,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async invokeCapability(sessionToken: string, leaseId: string, input: InvokeCapabilityInput): Promise<unknown> {
    const normalizedId = leaseId.trim();
    if (!normalizedId) throw new Error('leaseId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/capabilities/${encodeURIComponent(normalizedId)}/invoke`,
      input,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async pauseLease(sessionToken: string, leaseId: string): Promise<unknown> {
    const normalizedId = leaseId.trim();
    if (!normalizedId) throw new Error('leaseId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/capabilities/${encodeURIComponent(normalizedId)}/pause`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async resumeLease(sessionToken: string, leaseId: string): Promise<unknown> {
    const normalizedId = leaseId.trim();
    if (!normalizedId) throw new Error('leaseId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/capabilities/${encodeURIComponent(normalizedId)}/resume`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async terminateLease(sessionToken: string, leaseId: string): Promise<unknown> {
    const normalizedId = leaseId.trim();
    if (!normalizedId) throw new Error('leaseId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/capabilities/${encodeURIComponent(normalizedId)}/terminate`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  // ── Task Market (missing ops) ─────────────────────────────────────────────

  async rejectBid(sessionToken: string, taskId: string, bidId: string): Promise<unknown> {
    const normalizedTaskId = taskId.trim();
    const normalizedBidId = bidId.trim();
    if (!normalizedTaskId) throw new Error('taskId is required');
    if (!normalizedBidId) throw new Error('bidId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/tasks/${encodeURIComponent(normalizedTaskId)}/reject-bid`,
      { bidId: normalizedBidId },
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async withdrawBid(sessionToken: string, taskId: string, bidId: string): Promise<unknown> {
    const normalizedTaskId = taskId.trim();
    const normalizedBidId = bidId.trim();
    if (!normalizedTaskId) throw new Error('taskId is required');
    if (!normalizedBidId) throw new Error('bidId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/tasks/${encodeURIComponent(normalizedTaskId)}/withdraw-bid`,
      { bidId: normalizedBidId },
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async deliverTask(sessionToken: string, taskId: string, input: DeliverInput): Promise<unknown> {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) throw new Error('taskId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/tasks/${encodeURIComponent(normalizedTaskId)}/deliver`,
      input,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async confirmTask(sessionToken: string, taskId: string): Promise<unknown> {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) throw new Error('taskId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/tasks/${encodeURIComponent(normalizedTaskId)}/confirm`,
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

  async listDisputes(filters?: Record<string, QueryValue>): Promise<unknown[]> {
    const envelope = await this.requestData<unknown[]>('GET', '/api/v1/clawnet/market/disputes', undefined, filters);
    return envelope.data;
  }

  async getDispute(disputeId: string): Promise<unknown> {
    const envelope = await this.requestData<unknown>('GET', `/api/v1/clawnet/market/disputes/${encodeURIComponent(disputeId)}`);
    return envelope.data;
  }

  async openDispute(sessionToken: string, input: OpenDisputeInput): Promise<unknown> {
    const envelope = await this.requestData<unknown>('POST', '/api/v1/clawnet/market/disputes', input, undefined, {
      authToken: sessionToken,
    });
    return envelope.data;
  }

  async respondDispute(sessionToken: string, disputeId: string, input: RespondDisputeInput): Promise<unknown> {
    const normalizedId = disputeId.trim();
    if (!normalizedId) throw new Error('disputeId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/disputes/${encodeURIComponent(normalizedId)}/respond`,
      input,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  async resolveDispute(sessionToken: string, disputeId: string, input: ResolveDisputeInput): Promise<unknown> {
    const normalizedId = disputeId.trim();
    if (!normalizedId) throw new Error('disputeId is required');
    const envelope = await this.requestData<unknown>(
      'POST',
      `/api/v1/clawnet/market/disputes/${encodeURIComponent(normalizedId)}/resolve`,
      input,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  // ── Faucet ──────────────────────────────────────────────────────────────

  async claimFaucet(sessionToken: string): Promise<{ did: string; address: string; amount: number; txHash: string | null }> {
    const envelope = await this.requestData<{ did: string; address: string; amount: number; txHash: string | null }>(
      'POST',
      '/api/v1/clawnet/faucet/claim',
      undefined,
      undefined,
      { authToken: sessionToken },
    );
    return envelope.data;
  }

  private async requestData<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
    options?: RequestOptions,
  ): Promise<ApiDataEnvelope<T>> {
    const response = await this.send(method, path, body, query, options);
    const payload = await this.readPayload(response);
    this.ensureOk(response, payload, path);

    if (!isRecord(payload) || !('data' in payload)) {
      throw new Error(`Unexpected API envelope for ${method} ${path}`);
    }

    return {
      data: payload.data as T,
      links: isRecord(payload.links) ? (payload.links as ApiLinks) : undefined,
    };
  }

  private async requestList<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
    options?: RequestOptions,
  ): Promise<ApiListEnvelope<T>> {
    const response = await this.send(method, path, body, query, options);
    const payload = await this.readPayload(response);
    this.ensureOk(response, payload, path);

    if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.meta) || !isRecord(payload.links)) {
      throw new Error(`Unexpected list envelope for ${method} ${path}`);
    }

    return {
      data: payload.data as T[],
      meta: payload.meta as ApiListEnvelope<T>['meta'],
      links: payload.links as ApiLinks,
    };
  }

  private async requestNoContent(
    method: 'DELETE' | 'POST',
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
    options?: RequestOptions,
  ): Promise<void> {
    const response = await this.send(method, path, body, query, options);
    if (response.status === 204) {
      return;
    }
    const payload = await this.readPayload(response);
    this.ensureOk(response, payload, path);
  }

  private async send(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
    options?: RequestOptions,
  ): Promise<Response> {
    const headers = this.buildHeaders(options?.authToken);
    const init: RequestInit = {
      method,
      headers,
    };
    if (typeof body !== 'undefined') {
      init.body = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    return this.fetchImpl(this.toUrl(path, query), init);
  }

  private buildHeaders(authToken?: string): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
    };
    const token = authToken ?? this.accessToken;
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }

  private toUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(path.startsWith('/') ? path.slice(1) : path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === null || typeof value === 'undefined') {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async readPayload(response: Response): Promise<unknown> {
    if (response.status === 204) {
      return undefined;
    }
    const text = await response.text();
    if (!text) {
      return undefined;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(`Unable to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private ensureOk(response: Response, payload: unknown, path: string): void {
    if (response.ok) {
      return;
    }
    const fallback: ProblemDetail = {
      type: 'https://telagent.dev/errors/internal-error',
      title: response.statusText || 'Request failed',
      status: response.status,
      detail: `Request failed: ${path}`,
      instance: path,
      code: 'INTERNAL_ERROR',
    };
    const problem = this.normalizeProblem(payload, fallback);
    throw new TelagentSdkError(problem);
  }

  private normalizeProblem(payload: unknown, fallback: ProblemDetail): ProblemDetail {
    if (!isRecord(payload)) {
      return fallback;
    }
    if (
      typeof payload.type !== 'string'
      || typeof payload.title !== 'string'
      || typeof payload.status !== 'number'
    ) {
      return fallback;
    }
    return {
      type: payload.type,
      title: payload.title,
      status: payload.status,
      detail: typeof payload.detail === 'string' ? payload.detail : fallback.detail,
      instance: typeof payload.instance === 'string' ? payload.instance : fallback.instance,
      code: typeof payload.code === 'string' ? payload.code : fallback.code,
    };
  }
}

export interface AgentIdentityView {
  did: AgentDID;
  didHash: string;
  controller: string;
  publicKey: string;
  isActive: boolean;
  resolvedAtMs: number;
}
