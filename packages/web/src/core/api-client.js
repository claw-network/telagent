const DID_CLAW_PATTERN = /^did:claw:[A-Za-z0-9._:-]+$/;

export class ApiProblemError extends Error {
  constructor(problem) {
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

export function assertApiV1Path(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/v1/')) {
    throw new Error(`api path must start with /api/v1/, got: ${String(path)}`);
  }
  return path;
}

export function isDidClaw(value) {
  return typeof value === 'string' && DID_CLAW_PATTERN.test(value.trim());
}

export function toCiphertextHex(text) {
  const raw = typeof text === 'string' ? text : '';
  const bytes = new TextEncoder().encode(raw);
  if (bytes.length === 0) {
    return '0x00';
  }
  return `0x${Array.from(bytes, (entry) => entry.toString(16).padStart(2, '0')).join('')}`;
}

export function createEnvelopeId(nowMs = Date.now()) {
  const random = Math.random().toString(16).slice(2, 10);
  return `env-${nowMs}-${random}`;
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('baseUrl is required');
  }
  return baseUrl.trim().replace(/\/$/, '');
}

function safeJsonParse(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractEnvelopeData(payload) {
  if (payload && typeof payload === 'object' && Object.hasOwn(payload, 'data')) {
    return payload.data;
  }
  return payload;
}

export class TelagentApiClient {
  constructor({ baseUrl, fetchImpl } = {}) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetch implementation is required');
    }
    this.baseUrl = normalizeBaseUrl(baseUrl ?? 'http://127.0.0.1:9528');
  }

  setBaseUrl(baseUrl) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async request(method, path, options = {}) {
    const safePath = assertApiV1Path(path);
    const response = await this.fetchImpl(`${this.baseUrl}${safePath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    const text = await response.text();
    const payload = safeJsonParse(text);
    const contentType = response.headers.get('content-type') ?? '';

    if (!response.ok) {
      if (contentType.includes('application/problem+json') && payload && typeof payload === 'object') {
        throw new ApiProblemError(payload);
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

  async get(path, options = {}) {
    return this.request('GET', path, options);
  }

  async post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  async getData(path, options = {}) {
    const result = await this.get(path, options);
    return extractEnvelopeData(result.payload);
  }

  async postData(path, body, options = {}) {
    const result = await this.post(path, body, options);
    return extractEnvelopeData(result.payload);
  }

  async getSelfIdentity() {
    return this.getData('/api/v1/identities/self');
  }

  async resolveIdentity(did) {
    if (!isDidClaw(did)) {
      throw new Error('did must use did:claw:* format');
    }
    return this.getData(`/api/v1/identities/${encodeURIComponent(did.trim())}`);
  }

  async getNodeInfo() {
    return this.getData('/api/v1/node');
  }

  async pullMessages({ conversationId, limit = 30, cursor } = {}) {
    const params = new URLSearchParams();
    if (typeof conversationId === 'string' && conversationId.trim()) {
      params.set('conversation_id', conversationId.trim());
    }
    params.set('limit', String(Math.max(1, Math.min(200, limit))));
    if (typeof cursor === 'string' && cursor.trim()) {
      params.set('cursor', cursor.trim());
    }
    return this.getData(`/api/v1/messages/pull?${params.toString()}`);
  }

  async sendMessage(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('send payload must be an object');
    }
    if (!isDidClaw(payload.senderDid)) {
      throw new Error('senderDid must use did:claw:* format');
    }
    return this.postData('/api/v1/messages', payload);
  }

  async createGroup(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('create group payload must be an object');
    }
    if (!isDidClaw(payload.creatorDid)) {
      throw new Error('creatorDid must use did:claw:* format');
    }
    return this.postData('/api/v1/groups', payload);
  }

  async inviteMember(groupId, payload) {
    if (!groupId || typeof groupId !== 'string') {
      throw new Error('groupId is required');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('invite payload must be an object');
    }
    if (!isDidClaw(payload.inviterDid) || !isDidClaw(payload.inviteeDid)) {
      throw new Error('inviterDid/inviteeDid must use did:claw:* format');
    }
    return this.postData(`/api/v1/groups/${encodeURIComponent(groupId.trim())}/invites`, payload);
  }

  async acceptInvite(groupId, inviteId, payload) {
    if (!groupId || !inviteId) {
      throw new Error('groupId and inviteId are required');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('accept payload must be an object');
    }
    if (!isDidClaw(payload.inviteeDid)) {
      throw new Error('inviteeDid must use did:claw:* format');
    }
    return this.postData(
      `/api/v1/groups/${encodeURIComponent(groupId.trim())}/invites/${encodeURIComponent(inviteId.trim())}/accept`,
      payload,
    );
  }

  async listGroupMembers(groupId, view = 'all') {
    const payload = await this.listGroupMembersEnvelope(groupId, {
      view,
      page: 1,
      perPage: 200,
    });
    if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
      return payload.data;
    }
    return [];
  }

  async listGroupMembersEnvelope(groupId, options = {}) {
    if (!groupId || typeof groupId !== 'string') {
      throw new Error('groupId is required');
    }
    const view = typeof options.view === 'string' && options.view.trim()
      ? options.view.trim()
      : 'all';
    const page = Number.isInteger(options.page) ? Math.max(1, options.page) : 1;
    const perPage = Number.isInteger(options.perPage) ? Math.max(1, Math.min(200, options.perPage)) : 200;

    const result = await this.get(
      `/api/v1/groups/${encodeURIComponent(groupId.trim())}/members`
      + `?view=${encodeURIComponent(view)}&page=${page}&per_page=${perPage}`,
    );

    if (result.payload && typeof result.payload === 'object') {
      return result.payload;
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
      links: {
        self: null,
        next: null,
        prev: null,
        first: null,
        last: null,
      },
    };
  }

  async getGroupChainState(groupId) {
    if (!groupId || typeof groupId !== 'string') {
      throw new Error('groupId is required');
    }
    return this.getData(`/api/v1/groups/${encodeURIComponent(groupId.trim())}/chain-state`);
  }
}
