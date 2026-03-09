# DID-based Remote Node Connection — 实施文档

- 文档版本：v1.0
- 日期：2026-03-09
- 状态：TODO
- 前置依赖：ClawNet v0.6.0（开放式 Relay 网络 + 激励机制，已发布）
- 关联文档：
  - `docs/issues/clawnetd-open-relay-incentive.md`
  - `docs/reply/20260309-open-relay-incentive.md`
  - `docs/design/p2p-messaging-rfc.md`

---

## 1. 目标

让用户只需输入 DID 即可从任何地方连接到 NAT 后面的 telagent 节点。不再需要知道节点的 IP 地址或域名。

**Before**:
```
用户必须知道节点地址 → http://192.168.1.100:9529 (内网)
                     → https://alex.telagent.org (需公网 IP + 域名 + TLS)
```

**After**:
```
用户只需输入 DID → did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn
                 → 选择一个 gateway（默认 alex/bess）
                 → 自动通过 P2P 连接
```

---

## 2. 架构

```
                          ┌─────────────────────────┐
                          │   ClawNet P2P Network    │
                          │  ┌─────────────────────┐ │
                          │  │ Circuit Relay Nodes  │ │
                          │  │ (DHT 发现 + 评分)   │ │
                          │  └─────────────────────┘ │
                          └────────┬──────┬──────────┘
                                   │      │
Webapp ──HTTPS──► Gateway Node ────┘      └──── Target Node (NAT 后)
                  (alex/bess)                   (家里电脑)
                       │                             │
              /relay/{did}/api/v1/...         http://127.0.0.1:9529
                       │                             │
              API Proxy Service ──P2P msg──► API Proxy Service
              (gateway 角色)                 (target 角色)
                       │                             │
              topic: telagent/api-proxy      fetch(localhost)
                       │                             │
              等待 Promise resolve ◄── telagent/api-proxy-response
                       │
              HTTP Response ──► Webapp
```

**数据流（一次 API 调用）**:

```
1. Webapp → GET https://alex.telagent.org/relay/did:claw:zXXX/api/v1/conversations
2. Gateway relay route 拦截 → 解析 targetDid + path
3. Gateway ApiProxyService.proxyRequest(targetDid, 'GET', '/api/v1/conversations', headers)
   → 生成 requestId (UUID)
   → ClawNet P2P send (topic: telagent/api-proxy)
   → 注册 pending promise (Map<requestId, {resolve, reject, timer}>)
   → 等待...
4. ClawNet P2P → circuit relay → Target Node
5. Target ClawNetTransportService → routeMessage → onApiProxyRequest callback
6. Target ApiProxyService.handleProxyRequest(request, sourceDid)
   → fetch('http://127.0.0.1:9529/api/v1/conversations', { headers: request.headers })
   → 捕获 response (status + headers + body)
   → ClawNet P2P send (topic: telagent/api-proxy-response) → sourceDid
7. Gateway ClawNetTransportService → routeMessage → onApiProxyResponse callback
8. Gateway ApiProxyService.handleProxyResponse(response)
   → Map.get(requestId) → resolve(response)
9. Gateway relay route → 写入 HTTP response → Webapp
```

---

## 3. 前置准备

### 3.1 升级 @claw-network/sdk

```bash
cd packages/node
pnpm add @claw-network/sdk@0.6.0
```

验证：

```typescript
import { ClawNetClient } from '@claw-network/sdk';
// client.relay 命名空间应可用
```

### 3.2 在 alex/bess 节点启用 Relay

在两个云节点的 `.env.cloud` 中添加：

```bash
CLAWNET_RELAY_ENABLED=true
CLAWNET_RELAY_MAX_CIRCUITS=128
```

重启节点后验证：

```bash
curl -s https://alex.telagent.org/api/v1/clawnet/health | jq .
# 确认 relay 状态正常

# 通过 ClawNet API 验证 relay 功能
# GET /api/v1/relay/health 应返回 relayEnabled: true, natStatus: "public"
```

---

## 4. Phase 1: Protocol — API Proxy 消息类型

### 4.1 任务

在 `@telagent/protocol` 的 types 中添加 API 代理消息的接口定义。

### 4.2 改动文件

**`packages/protocol/src/types.ts`** — 在文件末尾（ProfileCardPayload 之后）追加：

```typescript
// ── API Proxy (DID-based Remote Access) ───────────────────────────────────────

/**
 * An API request proxied through ClawNet P2P.
 * Gateway node sends this to the target node via topic 'telagent/api-proxy'.
 */
export interface ApiProxyRequest {
  /** UUID for correlating request with response. */
  requestId: string;
  /** HTTP method: GET, POST, PUT, DELETE. */
  method: string;
  /** Request path including query string, e.g. '/api/v1/conversations?limit=20'. */
  path: string;
  /** HTTP headers to forward (including Authorization). */
  headers: Record<string, string>;
  /** Request body as string (JSON-serialized). Absent for GET/DELETE. */
  body?: string;
}

/**
 * Response to an API proxy request.
 * Target node sends this back to the gateway via topic 'telagent/api-proxy-response'.
 */
export interface ApiProxyResponse {
  /** Must match the requestId from the corresponding ApiProxyRequest. */
  requestId: string;
  /** HTTP status code (200, 401, 404, 500, etc.). */
  status: number;
  /** Response headers. */
  headers: Record<string, string>;
  /** Response body as string. */
  body?: string;
}
```

### 4.3 验收

- `pnpm --filter @telagent/protocol build` 通过
- 新类型可从 `@telagent/protocol` 导入

---

## 5. Phase 2: Node — ApiProxyService

### 5.1 任务

新建 `ApiProxyService`，同时承担 target（接收代理请求并执行）和 gateway（转发请求并关联响应）两个角色。

### 5.2 新建文件

**`packages/node/src/services/api-proxy-service.ts`**

#### 完整实现规格

```typescript
import type { ApiProxyRequest, ApiProxyResponse } from '@telagent/protocol';
import type { ClawNetTransportService } from './clawnet-transport-service.js';

const logger = console;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 1_048_576; // 1 MB
const PING_TIMEOUT_MS = 5_000;

export interface ApiProxyConfig {
  /** Whether this node accepts API proxy requests (target role). Default: true. */
  enabled: boolean;
  /** Whether this node can relay for other DIDs (gateway role). Default: true. */
  gatewayEnabled: boolean;
  /** Proxy request timeout in milliseconds. Default: 30000. */
  timeoutMs: number;
  /** Gateway-side rate limit: max requests per minute per source IP. Default: 60. */
  rateLimitPerMinute: number;
  /** Maximum request/response body size in bytes. Default: 1048576 (1MB). */
  maxBodyBytes: number;
}

interface PendingRequest {
  resolve: (response: ApiProxyResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingPing {
  resolve: (result: { reachable: boolean; latencyMs: number }) => void;
  timer: ReturnType<typeof setTimeout>;
  startMs: number;
}

export class ApiProxyService {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly pendingPings = new Map<string, PendingPing>();

  constructor(
    private readonly config: ApiProxyConfig,
    private readonly transport: ClawNetTransportService,
    private readonly localPort: number,
  ) {}

  // ── Target role: handle incoming proxy request ─────────

  async handleProxyRequest(
    request: ApiProxyRequest,
    sourceDid: string,
  ): Promise<void> {
    if (!this.config.enabled) {
      // Respond with 403 — this node does not accept proxy requests
      await this.transport.sendApiProxyResponse(sourceDid, {
        requestId: request.requestId,
        status: 403,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'API proxy not enabled on this node' }),
      });
      return;
    }

    try {
      const url = `http://127.0.0.1:${this.localPort}${request.path}`;
      const fetchInit: RequestInit = {
        method: request.method,
        headers: request.headers,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      };
      if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
        fetchInit.body = request.body;
      }

      const res = await fetch(url, fetchInit);
      const bodyText = await res.text();

      // Enforce body size limit
      if (bodyText.length > this.config.maxBodyBytes) {
        await this.transport.sendApiProxyResponse(sourceDid, {
          requestId: request.requestId,
          status: 413,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Response body exceeds size limit' }),
        });
        return;
      }

      // Collect response headers
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        resHeaders[key] = value;
      });

      await this.transport.sendApiProxyResponse(sourceDid, {
        requestId: request.requestId,
        status: res.status,
        headers: resHeaders,
        body: bodyText,
      });
    } catch (err) {
      logger.error('[api-proxy] Failed to proxy request %s: %s', request.requestId, (err as Error).message);
      await this.transport.sendApiProxyResponse(sourceDid, {
        requestId: request.requestId,
        status: 504,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Gateway timeout' }),
      }).catch(() => {});
    }
  }

  // ── Gateway role: send proxy request and await response ─

  async proxyRequest(
    targetDid: string,
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<ApiProxyResponse> {
    if (!this.config.gatewayEnabled) {
      throw new Error('Gateway mode not enabled on this node');
    }

    // Enforce body size limit
    if (body && body.length > this.config.maxBodyBytes) {
      return {
        requestId: '',
        status: 413,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Request body exceeds size limit' }),
      };
    }

    const requestId = crypto.randomUUID();
    const request: ApiProxyRequest = { requestId, method, path, headers, body };

    return new Promise<ApiProxyResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`API proxy request timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });

      this.transport.sendApiProxyRequest(targetDid, request).catch((err) => {
        this.pending.delete(requestId);
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // ── Gateway role: correlate incoming response ───────────

  handleProxyResponse(response: ApiProxyResponse): void {
    const entry = this.pending.get(response.requestId);
    if (!entry) {
      logger.warn('[api-proxy] Received response for unknown request %s', response.requestId);
      return;
    }
    this.pending.delete(response.requestId);
    clearTimeout(entry.timer);
    entry.resolve(response);
  }

  // ── Ping: lightweight reachability check ────────────────

  async ping(targetDid: string): Promise<{ reachable: boolean; latencyMs: number }> {
    const pingId = crypto.randomUUID();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPings.delete(pingId);
        resolve({ reachable: false, latencyMs: -1 });
      }, PING_TIMEOUT_MS);

      this.pendingPings.set(pingId, { resolve, timer, startMs: Date.now() });

      this.transport.sendApiProxyPing(targetDid, pingId).catch(() => {
        this.pendingPings.delete(pingId);
        clearTimeout(timer);
        resolve({ reachable: false, latencyMs: -1 });
      });
    });
  }

  async handlePing(sourceDid: string, pingId: string): Promise<void> {
    if (!this.config.enabled) return;
    await this.transport.sendApiProxyPong(sourceDid, pingId);
  }

  handlePong(pingId: string): void {
    const entry = this.pendingPings.get(pingId);
    if (!entry) return;
    this.pendingPings.delete(pingId);
    clearTimeout(entry.timer);
    entry.resolve({ reachable: true, latencyMs: Date.now() - entry.startMs });
  }

  // ── Cleanup ─────────────────────────────────────────────

  dispose(): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('ApiProxyService disposed'));
    }
    this.pending.clear();
    for (const [id, entry] of this.pendingPings) {
      clearTimeout(entry.timer);
    }
    this.pendingPings.clear();
  }
}
```

#### 关键设计决策

| 决策 | 理由 |
|------|------|
| Target 调用本地 `fetch('http://127.0.0.1:{port}')` | 复用所有已有中间件（auth、CORS、rate limit、route handler），零耦合 |
| Gateway 用 `Map<requestId, Promise>` 关联 | 多个并发 proxy 请求互不干扰，requestId 为 UUID 保证唯一 |
| 30s 超时 | 与 ClawNet P2P 的 `timeoutMs` 默认值对齐 |
| 1MB body 限制 | P2P 消息层推荐 64KB 载荷，但含 gzip 压缩(>1KB 自动)实际可传输更大；1MB 覆盖绝大多数 API 请求 |
| Ping 独立 topic | 比复用 api-proxy 发 "ping" body 更轻量，5s 超时更快失败 |

### 5.3 验收

- `ApiProxyService` 可实例化，无外部依赖（纯 TypeScript）
- Target 角色单测：mock transport + mock fetch → 验证 request/response 透传
- Gateway 角色单测：mock transport → `proxyRequest()` 发送 → `handleProxyResponse()` resolve → 验证结果
- Timeout 单测：不调用 `handleProxyResponse()` → Promise reject after 30s
- Ping 单测：`ping()` → `handlePong()` → latencyMs > 0

---

## 6. Phase 2 (续): ClawNetTransportService 扩展

### 6.1 任务

在现有 `ClawNetTransportService` 中添加 4 个新 topic、4 个新 callback、4 个新发送方法。

### 6.2 改动文件

**`packages/node/src/services/clawnet-transport-service.ts`**

#### 6.2.1 新增 topic 常量

在现有常量后添加（约 L11 区域）：

```typescript
// 现有：
const TOPIC_ENVELOPE = 'telagent/envelope';
const TOPIC_RECEIPT = 'telagent/receipt';
const TOPIC_GROUP_SYNC = 'telagent/group-sync';
const TOPIC_PROFILE_CARD = 'telagent/profile-card';
const TOPIC_ATTACHMENT = '_attachment';

// 新增：
const TOPIC_API_PROXY = 'telagent/api-proxy';
const TOPIC_API_PROXY_RESPONSE = 'telagent/api-proxy-response';
const TOPIC_API_PROXY_PING = 'telagent/api-proxy-ping';
const TOPIC_API_PROXY_PONG = 'telagent/api-proxy-pong';
```

#### 6.2.2 扩展 TopicCallbacks

新增 4 个可选 callback：

```typescript
export type TopicCallbacks = {
  onEnvelope?: (raw: Record<string, unknown>, sourceDid: string) => Promise<unknown>;
  onReceipt?: (receipt: DeliveryReceipt, sourceDid: string) => Promise<unknown>;
  onGroupSync?: (payload: GroupSyncPayload, sourceDid: string) => Promise<unknown>;
  onProfileCard?: (payload: ProfileCardPayload, sourceDid: string) => Promise<unknown>;
  onAttachment?: (info: AttachmentNotification, sourceDid: string) => Promise<void>;
  // --- 新增 ---
  onApiProxyRequest?: (request: ApiProxyRequest, sourceDid: string) => Promise<void>;
  onApiProxyResponse?: (response: ApiProxyResponse) => void;
  onApiProxyPing?: (pingId: string, sourceDid: string) => Promise<void>;
  onApiProxyPong?: (pingId: string) => void;
};
```

添加导入：

```typescript
import type { ApiProxyRequest, ApiProxyResponse } from '@telagent/protocol';
```

#### 6.2.3 扩展 routeMessage()

在 `switch (data.topic)` 中新增 4 个 case：

```typescript
case TOPIC_API_PROXY:
  await this.callbacks.onApiProxyRequest?.(parsed as unknown as ApiProxyRequest, data.sourceDid);
  break;
case TOPIC_API_PROXY_RESPONSE:
  this.callbacks.onApiProxyResponse?.(parsed as unknown as ApiProxyResponse);
  break;
case TOPIC_API_PROXY_PING:
  await this.callbacks.onApiProxyPing?.((parsed as any).pingId as string, data.sourceDid);
  break;
case TOPIC_API_PROXY_PONG:
  this.callbacks.onApiProxyPong?.((parsed as any).pingId as string);
  break;
```

#### 6.2.4 新增发送方法

在类中添加（参考现有 `sendEnvelope()` / `sendProfileCard()` 模式）：

```typescript
async sendApiProxyRequest(targetDid: string, request: ApiProxyRequest): Promise<void> {
  await this.gateway.client.messaging.send({
    targetDid,
    topic: TOPIC_API_PROXY,
    payload: JSON.stringify(request),
    ttlSec: 60,
    priority: 2,      // HIGH — API 请求需要低延迟
    compress: true,
    idempotencyKey: `api-proxy:${request.requestId}`,
  });
}

async sendApiProxyResponse(targetDid: string, response: ApiProxyResponse): Promise<void> {
  await this.gateway.client.messaging.send({
    targetDid,
    topic: TOPIC_API_PROXY_RESPONSE,
    payload: JSON.stringify(response),
    ttlSec: 60,
    priority: 2,
    compress: true,
    idempotencyKey: `api-proxy-res:${response.requestId}`,
  });
}

async sendApiProxyPing(targetDid: string, pingId: string): Promise<void> {
  await this.gateway.client.messaging.send({
    targetDid,
    topic: TOPIC_API_PROXY_PING,
    payload: JSON.stringify({ pingId }),
    ttlSec: 30,
    priority: 3,      // URGENT — ping 应最快投递
    compress: false,
  });
}

async sendApiProxyPong(targetDid: string, pingId: string): Promise<void> {
  await this.gateway.client.messaging.send({
    targetDid,
    topic: TOPIC_API_PROXY_PONG,
    payload: JSON.stringify({ pingId }),
    ttlSec: 30,
    priority: 3,
    compress: false,
  });
}
```

### 6.3 验收

- `pnpm --filter @telagent/node build` 通过
- 现有测试不回归

---

## 7. Phase 3: HTTP Gateway 路由

### 7.1 任务

新建 HTTP relay 路由，让 gateway 节点可以通过 HTTP 代理转发 API 请求到目标 DID。

### 7.2 新建文件

**`packages/node/src/api/routes/relay.ts`**

#### 完整实现规格

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RuntimeContext } from '../types.js';

const DID_PATTERN = /^did:claw:z[A-Za-z0-9]{32,}$/;
const MAX_BODY_SIZE = 1_048_576; // 1 MB

// ── Simple in-memory rate limiter ────────────────────────

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(sourceIp: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(sourceIp);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(sourceIp, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  bucket.count++;
  return bucket.count <= maxPerMinute;
}

// ── Body reading ─────────────────────────────────────────

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ── Route handler ────────────────────────────────────────

/**
 * Mount under /relay in the router.
 *
 * Routes:
 *   GET  /relay/info                     — gateway info + relay network status
 *   GET  /relay/:targetDid/ping          — DID reachability check
 *   ALL  /relay/:targetDid/api/v1/...    — proxy API requests to target
 */
export function relayRoutes(ctx: RuntimeContext) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<boolean> => {
    // Only process if gateway is enabled
    if (!ctx.apiProxyService) return false;

    // GET /relay/info
    if (pathname === '/info' || pathname === '/info/') {
      if (req.method !== 'GET') {
        writeJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      try {
        // Fetch relay network info from ClawNet
        const health = await ctx.clawnetGateway.client.relay?.getHealth?.();
        const discover = await ctx.clawnetGateway.client.relay?.discover?.();
        const selfDid = ctx.identityService.getSelfDid();
        writeJson(res, 200, {
          data: {
            gatewayDid: selfDid,
            gatewayEnabled: true,
            relayHealth: health ?? null,
            availableRelays: discover?.relays ?? [],
          },
        });
      } catch {
        writeJson(res, 200, {
          data: {
            gatewayDid: ctx.identityService.getSelfDid(),
            gatewayEnabled: true,
            relayHealth: null,
            availableRelays: [],
          },
        });
      }
      return true;
    }

    // Parse /:targetDid/...
    const firstSlash = pathname.indexOf('/', 1);
    const targetDid = firstSlash === -1
      ? pathname.slice(1)
      : pathname.slice(1, firstSlash);
    const remaining = firstSlash === -1 ? '' : pathname.slice(firstSlash);

    if (!DID_PATTERN.test(targetDid)) {
      writeJson(res, 400, { error: 'Invalid DID format. Expected did:claw:z...' });
      return true;
    }

    // Rate limiting
    const sourceIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';
    if (!checkRateLimit(sourceIp, ctx.apiProxyService.config.rateLimitPerMinute)) {
      res.setHeader('Retry-After', '60');
      writeJson(res, 429, { error: 'Rate limit exceeded' });
      return true;
    }

    // GET /:targetDid/ping
    if (remaining === '/ping' || remaining === '/ping/') {
      if (req.method !== 'GET') {
        writeJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      const result = await ctx.apiProxyService.ping(targetDid);
      writeJson(res, 200, { data: result });
      return true;
    }

    // Proxy: /:targetDid/api/v1/...
    if (!remaining.startsWith('/api/')) {
      writeJson(res, 400, { error: 'Proxy path must start with /api/' });
      return true;
    }

    // Read request body
    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
      try {
        body = await readBody(req, MAX_BODY_SIZE);
      } catch {
        writeJson(res, 413, { error: 'Request body too large (max 1MB)' });
        return true;
      }
    }

    // Collect headers to forward
    const forwardHeaders: Record<string, string> = {};
    if (req.headers.authorization) {
      forwardHeaders['authorization'] = req.headers.authorization as string;
    }
    if (req.headers['content-type']) {
      forwardHeaders['content-type'] = req.headers['content-type'] as string;
    }
    forwardHeaders['accept'] = (req.headers.accept as string) || 'application/json';

    try {
      const proxyResponse = await ctx.apiProxyService.proxyRequest(
        targetDid,
        req.method || 'GET',
        remaining,
        forwardHeaders,
        body,
      );

      // Write proxy response back to client
      for (const [key, value] of Object.entries(proxyResponse.headers)) {
        // Skip hop-by-hop headers
        if (key.toLowerCase() === 'transfer-encoding') continue;
        res.setHeader(key, value);
      }
      res.writeHead(proxyResponse.status);
      res.end(proxyResponse.body ?? '');
    } catch (err) {
      writeJson(res, 504, {
        error: 'Gateway timeout — target node did not respond',
        detail: (err as Error).message,
      });
    }

    return true;
  };
}

function writeJson(res: ServerResponse, status: number, data: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(data));
}
```

### 7.3 改动文件

**`packages/node/src/api/server.ts`** — 挂载路由 + auth 豁免

1. 导入 relay 路由：

```typescript
import { relayRoutes } from './routes/relay.js';
```

2. 在 `buildRouter()` 中添加挂载（在现有 routes 之后）：

```typescript
// 条件挂载：仅当 gateway 模式启用时
if (ctx.apiProxyService) {
  router.mount('/relay', relayRoutes(ctx));
}
```

3. 在 `AUTH_WHITELIST` 中添加 relay 豁免：

```typescript
{ path: '/relay' },  // relay 路由免认证（target 节点自行验证）
```

### 7.4 验收

- `GET /relay/info` 返回 gateway 信息
- `GET /relay/did:claw:zXXX/ping` 返回 `{ data: { reachable, latencyMs } }`
- `GET /relay/did:claw:zXXX/api/v1/node` 返回目标节点信息
- `POST /relay/did:claw:zXXX/api/v1/session/unlock` 可以解锁目标节点 session
- 无效 DID → 400
- 超频 → 429

---

## 8. Phase 4: 配置 & 装配

### 8.1 Config 改动

**`packages/node/src/config.ts`**

#### 8.1.1 新增 ApiProxyConfig 接口

在 `OwnerConfig` 接口之后添加：

```typescript
export interface ApiProxyConfig {
  enabled: boolean;
  gatewayEnabled: boolean;
  timeoutMs: number;
  rateLimitPerMinute: number;
  maxBodyBytes: number;
}
```

#### 8.1.2 扩展 AppConfig

```typescript
export interface AppConfig {
  host: string;
  port: number;
  publicUrl?: string;
  paths: TelagentStoragePaths;
  mailboxCleanupIntervalSec: number;
  mailboxStore: MailboxStoreConfig;
  chain: ChainConfig;
  clawnet: ClawNetConfig;
  owner: OwnerConfig;
  monitoring: MonitoringConfig;
  apiProxy: ApiProxyConfig;           // ← 新增
}
```

#### 8.1.3 在 loadConfigFromEnv() 中添加解析

在 `return { ... }` 之前添加：

```typescript
const apiProxy: ApiProxyConfig = {
  enabled: parseBoolean(process.env.TELAGENT_API_PROXY_ENABLED, true),
  gatewayEnabled: parseBoolean(process.env.TELAGENT_API_PROXY_GATEWAY_ENABLED, true),
  timeoutMs: Number(process.env.TELAGENT_API_PROXY_TIMEOUT_MS || 30_000),
  rateLimitPerMinute: Number(process.env.TELAGENT_API_PROXY_RATE_LIMIT || 60),
  maxBodyBytes: Number(process.env.TELAGENT_API_PROXY_MAX_BODY_BYTES || 1_048_576),
};
```

并在 return 对象中添加 `apiProxy`。

#### 8.1.4 环境变量清单

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `TELAGENT_API_PROXY_ENABLED` | `true` | 是否接受来自其他节点的 API 代理请求 |
| `TELAGENT_API_PROXY_GATEWAY_ENABLED` | `true` | 是否提供 HTTP relay gateway 服务 |
| `TELAGENT_API_PROXY_TIMEOUT_MS` | `30000` | 代理请求超时（毫秒） |
| `TELAGENT_API_PROXY_RATE_LIMIT` | `60` | 每分钟每 IP 最大代理请求数 |
| `TELAGENT_API_PROXY_MAX_BODY_BYTES` | `1048576` | 请求/响应 body 最大字节数 |

### 8.2 RuntimeContext 改动

**`packages/node/src/api/types.ts`**

新增 `apiProxyService` 可选字段：

```typescript
import type { ApiProxyService } from '../services/api-proxy-service.js';

export interface RuntimeContext {
  config: ApiServerConfig;
  identityService: IdentityAdapterService;
  groupService: GroupService;
  messageService: MessageService;
  attachmentService: AttachmentService;
  monitoringService: NodeMonitoringService;
  keyLifecycleService: KeyLifecycleService;
  clawnetGateway: ClawNetGatewayService;
  clawnetTransportService: ClawNetTransportService;
  sessionManager: SessionManager;
  nonceManager: NonceManager;
  ownerPermissionService?: OwnerPermissionService;
  contactService: ContactService;
  selfProfileStore: SelfProfileStore;
  peerProfileRepository: PeerProfileRepository;
  configuredPassphrase?: string;
  apiProxyService?: ApiProxyService;       // ← 新增
}
```

### 8.3 TelagentNode.start() 装配

**`packages/node/src/app.ts`**

#### 8.3.1 导入

```typescript
import { ApiProxyService } from './services/api-proxy-service.js';
```

#### 8.3.2 实例化 ApiProxyService

在 `this.clawnetTransportService = new ClawNetTransportService(...)` 之后添加：

```typescript
// API Proxy Service (DID-based remote access)
const apiProxyService = new ApiProxyService(
  this.config.apiProxy,
  this.clawnetTransportService,
  this.config.port,
);
```

#### 8.3.3 添加到 RuntimeContext

在 runtime 对象中添加：

```typescript
const runtime: RuntimeContext = {
  // ... 现有字段 ...
  configuredPassphrase: passphrase ?? undefined,
  apiProxyService: this.config.apiProxy.gatewayEnabled || this.config.apiProxy.enabled
    ? apiProxyService
    : undefined,
};
```

#### 8.3.4 注册 P2P callbacks

在 `this.clawnetTransportService.startListening({...})` 的 callback 对象中添加 4 个新 callback：

```typescript
this.clawnetTransportService.startListening({
  onEnvelope: (raw, sourceDid) => this.messageService!.ingestFederatedEnvelope(raw, sourceDid),
  onAttachment: async (info, _sourceDid) => { /* 现有代码 */ },
  onProfileCard: async (payload, sourceDid) => { /* 现有代码 */ },
  // ── 新增: API Proxy callbacks ──
  onApiProxyRequest: apiProxyService
    ? (req, sourceDid) => apiProxyService.handleProxyRequest(req, sourceDid)
    : undefined,
  onApiProxyResponse: apiProxyService
    ? (res) => apiProxyService.handleProxyResponse(res)
    : undefined,
  onApiProxyPing: apiProxyService
    ? (pingId, sourceDid) => apiProxyService.handlePing(sourceDid, pingId)
    : undefined,
  onApiProxyPong: apiProxyService
    ? (pingId) => apiProxyService.handlePong(pingId)
    : undefined,
});
```

#### 8.3.5 Dispose

在 `stop()` 方法中添加：

```typescript
// 在 clawnetTransportService?.stopListening() 之前
if (this.apiProxyService) {
  this.apiProxyService.dispose();
}
```

### 8.4 验收

- `pnpm --filter @telagent/node build` 通过
- `pnpm --filter @telagent/node test` 无回归
- 节点启动日志显示 API proxy service 初始化
- `TELAGENT_API_PROXY_ENABLED=false` → 代理请求返回 403
- `TELAGENT_API_PROXY_GATEWAY_ENABLED=false` → `/relay/` 路由不挂载

---

## 9. Phase 5: Webapp — DID 连接模式

### 9.1 任务

改造 ConnectForm 和 Connection Store，支持用户输入 DID 进行连接。

### 9.2 改动文件

#### 9.2.1 ConnectForm.tsx

**`packages/webapp/src/components/connect/ConnectForm.tsx`**

**核心改动：**

1. **DID 检测逻辑** — 在 Node URL 输入框 `onChange` 事件中检测输入是否为 DID：

```typescript
const DID_REGEX = /^did:claw:z[A-Za-z0-9]{32,}$/;

function isDidInput(value: string): boolean {
  return DID_REGEX.test(value.trim());
}
```

2. **新增状态** — DID 模式相关：

```typescript
const [isDid, setIsDid] = useState(false);
const [gatewayUrl, setGatewayUrl] = useState("https://alex.telagent.org");
```

3. **DID 探测 hook** — 新建 `useDidProbe`：

```typescript
function useDidProbe(did: string, gatewayUrl: string) {
  const [status, setStatus] = useState<"idle" | "probing" | "reachable" | "unreachable">("idle");
  const [latencyMs, setLatencyMs] = useState(-1);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);

  useEffect(() => {
    if (!did || !gatewayUrl) {
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("probing");

    async function probe() {
      try {
        // 1. Ping via gateway
        const pingRes = await fetch(
          `${gatewayUrl}/relay/${encodeURIComponent(did)}/ping`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        );
        const pingData = await pingRes.json();
        if (!pingData.data?.reachable) {
          setStatus("unreachable");
          return;
        }
        setLatencyMs(pingData.data.latencyMs);

        // 2. Fetch node info via gateway
        const nodeRes = await fetch(
          `${gatewayUrl}/relay/${encodeURIComponent(did)}/api/v1/node`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        );
        const nodeBody = await nodeRes.json();
        const node = nodeBody.data ?? nodeBody;

        // 3. Fetch identity
        const selfRes = await fetch(
          `${gatewayUrl}/relay/${encodeURIComponent(did)}/api/v1/identities/self`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        );
        const selfBody = await selfRes.json();
        const self = selfBody.data ?? selfBody;

        setNodeInfo({
          did: self.did ?? did,
          didHash: self.didHash ?? "",
          version: node.version ?? "unknown",
        });
        setStatus("reachable");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("unreachable");
        }
      }
    }

    void probe();
    return () => controller.abort();
  }, [did, gatewayUrl]);

  return { status, latencyMs, nodeInfo };
}
```

4. **UI 条件渲染** — DID 模式下显示不同的表单：

```tsx
{isDid ? (
  <>
    {/* DID 模式 */}
    <div>
      <Label>{t("connect.did.label")}</Label>
      <Input value={nodeUrl} onChange={...} />
    </div>
    <div>
      <Label>{t("connect.did.gateway")}</Label>
      <select value={gatewayUrl} onChange={...}>
        <option value="https://alex.telagent.org">alex.telagent.org</option>
        <option value="https://bess.telagent.org">bess.telagent.org</option>
        <option value="custom">{t("connect.did.customGateway")}</option>
      </select>
    </div>
    {/* DID Avatar + 状态 */}
    <NodeAvatar status={didProbe.status} info={didProbe.nodeInfo} isLocal={false} />
    {didProbe.latencyMs > 0 && <Badge>{didProbe.latencyMs}ms</Badge>}
  </>
) : (
  <>
    {/* 原有 URL 模式 — 保持不变 */}
  </>
)}
```

5. **表单提交** — DID 模式下构造 relay URL：

```typescript
const onSubmit = async (event: FormEvent) => {
  event.preventDefault();
  if (isDid) {
    const relayNodeUrl = `${gatewayUrl}/relay/${nodeUrl.trim()}`;
    await connect({
      nodeUrl: relayNodeUrl,
      passphrase,
      connectionMode: 'relay',
      targetDid: nodeUrl.trim(),
      gatewayUrl,
    });
  } else {
    await connect({ nodeUrl: nodeUrl.trim(), passphrase });
  }
  // ... 后续导航
};
```

#### 9.2.2 connection.ts

**`packages/webapp/src/stores/connection.ts`**

**核心改动：**

1. **扩展接口**：

```typescript
interface ConnectInput {
  nodeUrl: string;
  passphrase: string;
  connectionMode?: 'direct' | 'relay';
  targetDid?: string;
  gatewayUrl?: string;
}

interface ConnectionStore {
  // 现有字段...
  connectionMode: 'direct' | 'relay';
  targetDid: string;
  gatewayUrl: string;
  // 现有方法...
}
```

2. **初始状态** — 添加新字段默认值：

```typescript
connectionMode: "direct",
targetDid: "",
gatewayUrl: "",
```

3. **connect() 方法改造**：

```typescript
connect: async (input) => {
  const nodeUrl = normalizeNodeUrl(input.nodeUrl);
  const isRelay = input.connectionMode === 'relay';
  const passphrase = input.passphrase;

  set({ status: "connecting", error: undefined });
  try {
    // 1. Probe (relay 模式 probe relay URL)
    await probeNode(nodeUrl);

    // 2. Unlock session (通过 relay URL 或直连)
    const tempSdk = new TelagentSdk({ baseUrl: nodeUrl });
    const result = await tempSdk.unlockSession({ passphrase });

    // 3. Create authenticated SDK
    const sdk = new TelagentSdk({
      baseUrl: nodeUrl,
      accessToken: result.sessionToken,
      fetchImpl: (input, init) =>
        fetch(input, init).then((res) => {
          if (res.status === 401) { get().disconnect(); }
          return res;
        }),
    });

    set({
      nodeUrl,
      sessionToken: result.sessionToken,
      sdk,
      status: "connected",
      error: undefined,
      reconnectHintVisible: false,
      connectionMode: isRelay ? 'relay' : 'direct',
      targetDid: input.targetDid ?? '',
      gatewayUrl: input.gatewayUrl ?? '',
    });
  } catch (error) {
    set({ status: "error", error: error instanceof Error ? error.message : String(error), sdk: null });
    throw error;
  }
},
```

4. **disconnect() 方法改造** — 清除 relay 字段：

```typescript
disconnect: () => {
  set({
    nodeUrl: "",
    sessionToken: "",
    sdk: null,
    status: "disconnected",
    error: undefined,
    reconnectHintVisible: false,
    connectionMode: "direct",
    targetDid: "",
    gatewayUrl: "",
  });
},
```

5. **持久化** — zustand persist 自动处理新字段

#### 9.2.3 i18n

**`packages/webapp/src/i18n/locales/en.json`** — 在 `connect` key 下添加：

```json
"did": {
  "label": "DID",
  "gateway": "Gateway Node",
  "customGateway": "Custom gateway...",
  "reachable": "Node reachable",
  "unreachable": "Node offline or unreachable",
  "latency": "Latency",
  "detecting": "Checking reachability...",
  "hint": "Enter a DID to connect through a gateway node. Your node can be behind NAT."
}
```

**`packages/webapp/src/i18n/locales/zh.json`** — 对应中文：

```json
"did": {
  "label": "DID",
  "gateway": "网关节点",
  "customGateway": "自定义网关...",
  "reachable": "节点在线",
  "unreachable": "节点离线或不可达",
  "latency": "延迟",
  "detecting": "检查可达性...",
  "hint": "输入 DID 通过网关节点连接。你的节点可以在 NAT 后面。"
}
```

### 9.3 验收

- 在 Node URL 输入框中输入 `did:claw:z...` → UI 自动切换为 DID 模式
- 选择 gateway → 自动 ping 目标节点 → 显示在线状态和延迟
- 输入 passphrase → 点击 Connect → 成功连接并导航到 /chat
- 刷新页面 → 自动重连成功（relay 模式信息从 localStorage 恢复）
- 输入普通 URL → 保持现有行为不变

---

## 10. 任务清单（WBS）

| ID | Phase | 任务 | 预估(PD) | 依赖 | 输出物 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TA-RA-000 | 前置 | 升级 `@claw-network/sdk` 到 v0.6.0 | 0.2 | - | package.json 更新 | `client.relay` 可用 | TODO |
| TA-RA-001 | Phase 1 | `@telagent/protocol` 添加 `ApiProxyRequest/Response` 类型 | 0.3 | - | types.ts | 类型可导入、`pnpm build` 通过 | TODO |
| TA-RA-002 | Phase 2 | 新建 `ApiProxyService`（target + gateway + ping） | 1.5 | TA-RA-001 | api-proxy-service.ts | 单测覆盖 target/gateway/ping/timeout | TODO |
| TA-RA-003 | Phase 2 | 扩展 `ClawNetTransportService`（4 topic + 4 callback + 4 send） | 1.0 | TA-RA-001 | clawnet-transport-service.ts | 编译通过、现有测试无回归 | TODO |
| TA-RA-004 | Phase 3 | 新建 HTTP relay 路由（/relay/:did/*） | 1.0 | TA-RA-002 | routes/relay.ts | info + ping + proxy 三个端点可用 | TODO |
| TA-RA-005 | Phase 3 | `server.ts` 挂载 relay 路由 + auth 豁免 | 0.3 | TA-RA-004 | server.ts | relay 路径不需要 session token | TODO |
| TA-RA-006 | Phase 4 | `config.ts` 添加 `apiProxy` 配置 + env 解析 | 0.3 | - | config.ts | 5 个 env var 可正确解析 | TODO |
| TA-RA-007 | Phase 4 | `app.ts` 装配 ApiProxyService + P2P callbacks | 0.5 | TA-RA-002~006 | app.ts, types.ts | 节点启动日志显示 api-proxy ready | TODO |
| TA-RA-008 | Phase 5 | ConnectForm DID 检测 + gateway 选择器 + DID 探测 | 1.5 | TA-RA-004 | ConnectForm.tsx | DID 输入 → 切换 UI → 探测 → 显示状态 | TODO |
| TA-RA-009 | Phase 5 | Connection store relay 模式改造 | 0.5 | TA-RA-008 | connection.ts | relay 连接 + 持久化 + 重连 | TODO |
| TA-RA-010 | Phase 5 | i18n 翻译（中英文） | 0.2 | TA-RA-008 | en.json, zh.json | 所有新 UI 文案有翻译 | TODO |
| TA-RA-011 | 集成 | 本地双节点集成测试 | 0.5 | TA-RA-007 | 测试脚本 | gateway→target 通信闭环 PASS | TODO |
| TA-RA-012 | 集成 | 云端 NAT 测试（alex 作为 gateway） | 0.5 | TA-RA-007 | 测试报告 | NAT 后节点可通 gateway 访问 | TODO |
| TA-RA-013 | 集成 | Webapp E2E 测试 | 0.5 | TA-RA-009 | 测试报告 | DID 输入 → 连接 → 聊天 → 刷新重连 | TODO |
| | | **总计** | **8.8 PD** | | | | |

---

## 11. 文件变更清单

### 新建文件 (2)

| 文件 | 内容 |
|------|------|
| `packages/node/src/services/api-proxy-service.ts` | API Proxy Service（target + gateway + ping） |
| `packages/node/src/api/routes/relay.ts` | HTTP relay 路由（/relay/info, /relay/:did/ping, /relay/:did/api/v1/*） |

### 修改文件 (9)

| 文件 | 改动 |
|------|------|
| `packages/protocol/src/types.ts` | 添加 `ApiProxyRequest`, `ApiProxyResponse` 接口 |
| `packages/node/src/services/clawnet-transport-service.ts` | +4 topic 常量、+4 callback、+4 send 方法、routeMessage() 扩展 |
| `packages/node/src/api/server.ts` | 导入 + 挂载 `/relay` 路由、`AUTH_WHITELIST` 添加 `/relay` |
| `packages/node/src/api/types.ts` | `RuntimeContext` 添加 `apiProxyService?: ApiProxyService` |
| `packages/node/src/app.ts` | 导入 ApiProxyService、实例化、注册 4 个 P2P callback、添加到 runtime、dispose |
| `packages/node/src/config.ts` | 添加 `ApiProxyConfig` 接口、`AppConfig.apiProxy`、`loadConfigFromEnv()` 解析 5 个 env var |
| `packages/webapp/src/components/connect/ConnectForm.tsx` | DID 检测、`useDidProbe` hook、gateway 选择器、条件 UI |
| `packages/webapp/src/stores/connection.ts` | 添加 `connectionMode/targetDid/gatewayUrl` 字段、改造 connect/disconnect |
| `packages/webapp/src/i18n/locales/en.json` + `zh.json` | 添加 `connect.did.*` 翻译键 |

### 依赖升级 (1)

| 包 | 当前版本 → 目标版本 |
|----|--------------------|
| `@claw-network/sdk` | 当前 → `0.6.0` |

---

## 12. 测试方案

### 12.1 单元测试

**`packages/node/src/services/api-proxy-service.test.ts`** (新建)

| 用例 | 验证点 |
|------|--------|
| target: 收到 proxy request → 调用 localhost → 回复 response | requestId 一致、status 正确、body 正确 |
| target: config.enabled=false → 返回 403 | 不调用 fetch |
| target: fetch 超时 → 返回 504 | error 消息正确 |
| target: response body 超过 1MB → 返回 413 | size 检查生效 |
| gateway: proxyRequest() → handleProxyResponse() → resolve | 完整 round-trip 关联 |
| gateway: 超时 → reject | 30s 后 reject，pending map 清理 |
| gateway: body 超过 1MB → 返回 413 | 不发送 P2P 消息 |
| gateway: config.gatewayEnabled=false → throw | 快速失败 |
| ping: ping() → handlePong() → reachable=true | latencyMs > 0 |
| ping: 超时 → reachable=false | 5s 后返回 |
| dispose: 清理所有 pending | resolve/reject 全部触发 |

**`packages/node/src/api/routes/relay.test.ts`** (新建)

| 用例 | 验证点 |
|------|--------|
| GET /relay/info → 200 gateway 信息 | gatewayDid 存在 |
| GET /relay/did:claw:zXXX/ping → 200 | 调用 apiProxyService.ping |
| GET /relay/did:claw:zXXX/api/v1/node → 200 | 调用 apiProxyService.proxyRequest |
| POST with body → 正确转发 | body 内容一致 |
| 无效 DID → 400 | 正则校验生效 |
| 超频 → 429 | Retry-After 头存在 |
| body > 1MB → 413 | readBody 截断 |

### 12.2 集成测试

**本地双节点**:

```bash
# 终端 1: Node A (gateway, port 9529)
TELAGENT_API_PORT=9529 \
TELAGENT_API_PROXY_GATEWAY_ENABLED=true \
pnpm --filter @telagent/node start

# 终端 2: Node B (target, port 9530)
TELAGENT_API_PORT=9530 \
TELAGENT_API_PROXY_ENABLED=true \
pnpm --filter @telagent/node start

# 终端 3: 通过 gateway 访问 target
# 先获取 Node B 的 DID
NODE_B_DID=$(curl -s http://127.0.0.1:9530/api/v1/identities/self | jq -r '.data.did')

# Ping
curl -s http://127.0.0.1:9529/relay/$NODE_B_DID/ping | jq .
# → { "data": { "reachable": true, "latencyMs": 45 } }

# 获取节点信息
curl -s http://127.0.0.1:9529/relay/$NODE_B_DID/api/v1/node | jq .
# → 与直连 Node B 返回相同结果

# 解锁 session
curl -s -X POST http://127.0.0.1:9529/relay/$NODE_B_DID/api/v1/session/unlock \
  -H 'Content-Type: application/json' \
  -d '{"passphrase":"xxx"}' | jq .
# → { "data": { "sessionToken": "tses_..." } }

# 用 session token 获取 conversations
TOKEN=$(上述返回的 token)
curl -s http://127.0.0.1:9529/relay/$NODE_B_DID/api/v1/conversations \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**云端 NAT 测试**:

```bash
# 在家里的电脑启动节点（NAT 后面，不暴露端口）
TELAGENT_API_PROXY_ENABLED=true pnpm --filter @telagent/node start

# 获取家里节点的 DID
HOME_DID="did:claw:zXXXXXX"

# 从任意电脑通过 alex.telagent.org 连接
curl -s https://alex.telagent.org/relay/$HOME_DID/ping | jq .

# 解锁 session
curl -s -X POST https://alex.telagent.org/relay/$HOME_DID/api/v1/session/unlock \
  -H 'Content-Type: application/json' \
  -d '{"passphrase":"xxx"}' | jq .

# 发送消息
curl -s -X POST https://alex.telagent.org/relay/$HOME_DID/api/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"...","text":"Hello via relay!"}' | jq .
```

### 12.3 Webapp E2E 测试

1. 打开 webapp /connect
2. 在 Node URL 输入 `did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn`
3. UI 自动切换 → DID 模式，显示 Gateway 选择器
4. 选择 `alex.telagent.org` → 自动 ping → 显示绿色 "Node reachable" + 延迟
5. 输入 passphrase → 点击 Connect
6. 验证导航到 /chat
7. 查看 conversations 列表
8. 发送一条消息
9. 刷新页面 → 自动重连到 relay 模式
10. 打开 Settings → 显示 "Connected via relay" + gateway URL

---

## 13. 安全考量

| 风险 | 缓解措施 |
|------|---------|
| **Gateway 可见明文** | Gateway 在 API proxy 层可见 request/response 包含的明文（如 passphrase）。P2P 传输层有 X25519+AES-256-GCM 加密，但 TelAgent API proxy 层目前不加密。缓解：仅使用受信任的 gateway、HTTPS 到 gateway |
| **Relay 滥用** | Gateway 侧速率限制 60 req/min per IP；ClawNet circuit relay 有 maxCircuitsPerPeer + flood protection |
| **DID 欺骗** | ClawNet P2P 的 `sourceDid` 由协议保证（libp2p 连接经过 Noise 握手验证 PeerId → DID 映射）|
| **Body 注入** | 1MB body 限制；target 调用本地 fetch 时 headers 原样转发，不做额外注入 |
| **DDoS via proxy** | Gateway 不放大流量（1:1 转发）；target 端有自己的 auth + rate limit |

---

## 14. 回滚方案

| 场景 | 回滚操作 |
|------|---------|
| 新代码导致节点启动失败 | `TELAGENT_API_PROXY_ENABLED=false` + `TELAGENT_API_PROXY_GATEWAY_ENABLED=false` → 完全禁用 API proxy，不影响现有功能 |
| P2P topic 冲突 | 新 topic 使用 `telagent/api-proxy*` 命名空间，不与现有 `telagent/envelope` 等冲突 |
| Webapp DID 模式 bug | 输入框检测到 URL 格式 → 走现有连接流程，DID 模式完全可选 |
| SDK 升级问题 | `@claw-network/sdk` 0.6.0 向后兼容，`client.relay` 命名空间为新增，不影响 `client.messaging` |

---

## 15. 部署顺序

1. **升级 SDK** — `pnpm add @claw-network/sdk@0.6.0`（所有节点）
2. **启用 ClawNet relay** — 在 alex/bess 的 `.env.cloud` 添加 `CLAWNET_RELAY_ENABLED=true`
3. **部署 node 更新** — 含 API proxy service + relay routes
4. **部署 webapp 更新** — 含 DID 连接模式
5. **验证** — 从任意位置通过 DID 连接到 alex/bess
6. **NAT 测试** — 在家里部署节点，通过 gateway 连接验证
