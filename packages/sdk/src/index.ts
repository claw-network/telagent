import type {
  AgentDID,
  Envelope,
  GroupChainState,
  GroupMemberRecord,
  GroupRecord,
  ProblemDetail,
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
  targetDomain: string;
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
}

export interface GroupMemberListInput {
  view?: 'all' | 'pending' | 'finalized';
  page?: number;
  perPage?: number;
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
    this.fetchImpl = options.fetchImpl ?? fetch;
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

  private async requestData<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
  ): Promise<ApiDataEnvelope<T>> {
    const response = await this.send(method, path, body, query);
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
  ): Promise<ApiListEnvelope<T>> {
    const response = await this.send(method, path, body, query);
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
    method: 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
  ): Promise<void> {
    const response = await this.send(method, path, body, query);
    if (response.status === 204) {
      return;
    }
    const payload = await this.readPayload(response);
    this.ensureOk(response, payload, path);
  }

  private async send(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
  ): Promise<Response> {
    const headers = this.buildHeaders();
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

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
    };
    if (this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`;
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
