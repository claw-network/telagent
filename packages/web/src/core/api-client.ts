const DID_CLAW_PATTERN = /^did:claw:[A-Za-z0-9._:-]+$/;

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  instance?: string;
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  status: number;
  payload: T;
  location: string | null;
  contentType: string;
}

export class ApiProblemError extends Error {
  problem: ProblemDetail;
  status?: number;
  code?: string;
  instance?: string;

  constructor(problem: ProblemDetail) {
    const title = typeof problem?.title === 'string' ? problem.title : 'Request failed';
    const detail = typeof problem?.detail === 'string' ? problem.detail : '';
    super(detail ? `${title}: ${detail}` : title);
    this.name = 'ApiProblemError';
    this.problem = problem ?? {};
    this.status = Number.isInteger(problem?.status) ? problem.status : undefined;
    this.code = typeof problem?.code === 'string' ? problem.code : undefined;
    this.instance = typeof problem?.instance === 'string' ? problem.instance : undefined;
  }
}

export function assertApiV1Path(path: string): string {
  if (typeof path !== 'string' || !path.startsWith('/api/v1/')) {
    throw new Error(`api path must start with /api/v1/, got: ${String(path)}`);
  }
  return path;
}

export function isDidClaw(value: unknown): value is string {
  return typeof value === 'string' && DID_CLAW_PATTERN.test(value.trim());
}

export function toCiphertextHex(text: string): string {
  const raw = typeof text === 'string' ? text : '';
  const bytes = new TextEncoder().encode(raw);
  if (bytes.length === 0) {
    return '0x00';
  }
  return `0x${Array.from(bytes, (entry) => entry.toString(16).padStart(2, '0')).join('')}`;
}

export function createEnvelopeId(nowMs = Date.now()): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `env-${nowMs}-${random}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('baseUrl is required');
  }
  return baseUrl.trim().replace(/\/$/, '');
}

function safeJsonParse(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractEnvelopeData(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && Object.hasOwn(payload, 'data')) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

export class TelagentApiClient {
  private fetchImpl: typeof fetch;
  private baseUrl: string;

  constructor({ baseUrl, fetchImpl }: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetch implementation is required');
    }
    this.baseUrl = normalizeBaseUrl(baseUrl ?? 'http://127.0.0.1:9528');
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async request(method: 'GET' | 'POST', path: string, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResponse> {
    const safePath = assertApiV1Path(path);
    const response = await this.fetchImpl(`${this.baseUrl}${safePath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    const text = await response.text();
    const payload = safeJsonParse(text);
    const contentType = response.headers.get('content-type') ?? '';

    if (!response.ok) {
      if (contentType.includes('application/problem+json') && payload && typeof payload === 'object') {
        throw new ApiProblemError(payload as ProblemDetail);
      }
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }

    return {
      status: response.status,
      payload,
      location: response.headers.get('location'),
      contentType,
    };
  }

  async get(path: string, options: { signal?: AbortSignal } = {}): Promise<ApiResponse> {
    return this.request('GET', path, options);
  }

  async post(path: string, body: unknown, options: { signal?: AbortSignal } = {}): Promise<ApiResponse> {
    return this.request('POST', path, { ...options, body });
  }

  async getData<T = unknown>(path: string, options: { signal?: AbortSignal } = {}): Promise<T> {
    const result = await this.get(path, options);
    return extractEnvelopeData(result.payload) as T;
  }

  async postData<T = unknown>(path: string, body: unknown, options: { signal?: AbortSignal } = {}): Promise<T> {
    const result = await this.post(path, body, options);
    return extractEnvelopeData(result.payload) as T;
  }

  async getSelfIdentity<T = unknown>(): Promise<T> {
    return this.getData<T>('/api/v1/identities/self');
  }

  async resolveIdentity<T = unknown>(did: string): Promise<T> {
    if (!isDidClaw(did)) {
      throw new Error('did must use did:claw:* format');
    }
    return this.getData<T>(`/api/v1/identities/${encodeURIComponent(did.trim())}`);
  }

  async getNodeInfo<T = unknown>(): Promise<T> {
    return this.getData<T>('/api/v1/node');
  }

  async pullMessages<T = unknown>({
    conversationId,
    limit = 30,
    cursor,
  }: { conversationId?: string; limit?: number; cursor?: string } = {}): Promise<T> {
    const params = new URLSearchParams();
    if (typeof conversationId === 'string' && conversationId.trim()) {
      params.set('conversation_id', conversationId.trim());
    }
    params.set('limit', String(Math.max(1, Math.min(200, limit))));
    if (typeof cursor === 'string' && cursor.trim()) {
      params.set('cursor', cursor.trim());
    }
    return this.getData<T>(`/api/v1/messages/pull?${params.toString()}`);
  }

  async sendMessage<T = unknown>(payload: Record<string, unknown>): Promise<T> {
    if (!payload || typeof payload !== 'object') {
      throw new Error('send payload must be an object');
    }
    if (!isDidClaw(payload.senderDid)) {
      throw new Error('senderDid must use did:claw:* format');
    }
    return this.postData<T>('/api/v1/messages', payload);
  }

  async createGroup<T = unknown>(payload: Record<string, unknown>): Promise<T> {
    if (!payload || typeof payload !== 'object') {
      throw new Error('create group payload must be an object');
    }
    if (!isDidClaw(payload.creatorDid)) {
      throw new Error('creatorDid must use did:claw:* format');
    }
    return this.postData<T>('/api/v1/groups', payload);
  }

  async inviteMember<T = unknown>(groupId: string, payload: Record<string, unknown>): Promise<T> {
    if (!groupId || typeof groupId !== 'string') {
      throw new Error('groupId is required');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('invite payload must be an object');
    }
    if (!isDidClaw(payload.inviterDid) || !isDidClaw(payload.inviteeDid)) {
      throw new Error('inviterDid/inviteeDid must use did:claw:* format');
    }
    return this.postData<T>(`/api/v1/groups/${encodeURIComponent(groupId.trim())}/invites`, payload);
  }

  async acceptInvite<T = unknown>(groupId: string, inviteId: string, payload: Record<string, unknown>): Promise<T> {
    if (!groupId || !inviteId) {
      throw new Error('groupId and inviteId are required');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('accept payload must be an object');
    }
    if (!isDidClaw(payload.inviteeDid)) {
      throw new Error('inviteeDid must use did:claw:* format');
    }
    return this.postData<T>(
      `/api/v1/groups/${encodeURIComponent(groupId.trim())}/invites/${encodeURIComponent(inviteId.trim())}/accept`,
      payload,
    );
  }

  async listGroupMembersEnvelope(groupId: string, options: { view?: string; page?: number; perPage?: number } = {}): Promise<{
    data: unknown[];
    meta: { pagination: { page: number; perPage: number; total: number; totalPages: number } };
    links: Record<string, string | null>;
  }> {
    if (!groupId || typeof groupId !== 'string') {
      throw new Error('groupId is required');
    }

    const view = typeof options.view === 'string' && options.view.trim() ? options.view.trim() : 'all';
    const pageInput = typeof options.page === 'number' ? options.page : 1;
    const perPageInput = typeof options.perPage === 'number' ? options.perPage : 200;
    const page = Number.isInteger(pageInput) ? Math.max(1, pageInput) : 1;
    const perPage = Number.isInteger(perPageInput) ? Math.max(1, Math.min(200, perPageInput)) : 200;

    const response = await this.get(`/api/v1/groups/${encodeURIComponent(groupId.trim())}/members?view=${encodeURIComponent(view)}&page=${page}&per_page=${perPage}`);
    const payload = response.payload;

    if (payload && typeof payload === 'object' && Object.hasOwn(payload, 'data')) {
      const entity = payload as {
        data?: unknown[];
        meta?: { pagination?: { page?: number; perPage?: number; total?: number; totalPages?: number } };
        links?: Record<string, string | null>;
      };
      return {
        data: Array.isArray(entity.data) ? entity.data : [],
        meta: {
          pagination: {
            page: entity.meta?.pagination?.page ?? page,
            perPage: entity.meta?.pagination?.perPage ?? perPage,
            total: entity.meta?.pagination?.total ?? 0,
            totalPages: entity.meta?.pagination?.totalPages ?? 1,
          },
        },
        links: entity.links ?? {},
      };
    }

    return {
      data: [],
      meta: {
        pagination: {
          page,
          perPage,
          total: 0,
          totalPages: 1,
        },
      },
      links: {},
    };
  }

  async listGroupMembers<T = unknown[]>(groupId: string, view = 'all'): Promise<T> {
    const payload = await this.listGroupMembersEnvelope(groupId, { view, page: 1, perPage: 200 });
    return payload.data as T;
  }

  async getGroupChainState<T = unknown>(groupId: string): Promise<T> {
    if (!groupId || typeof groupId !== 'string') {
      throw new Error('groupId is required');
    }
    return this.getData<T>(`/api/v1/groups/${encodeURIComponent(groupId.trim())}/chain-state`);
  }
}
