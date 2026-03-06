# P2P Transport 实施 — Agent Handoff Prompt

## 任务背景

TelAgent 当前通过 HTTP Federation 在节点间传递消息。现在要迁移到 ClawNet P2P 层。
ClawNet 团队已实现完整的 messaging API（Phase 1-3，307 tests passing），SDK `@claw-network/sdk@0.3.0` 已发布并安装到 `packages/node`。

**核心设计文档**: `docs/design/p2p-messaging-rfc.md`（v0.5），包含完整的 API 规范、SDK 接口、适配代码模板（§4 + §C.6）。

---

## 任务目标

实施 RFC §5 **第一阶段：双通道并行** — P2P 优先，HTTP Federation 作为 fallback。

---

## 架构要点

### 当前消息流（HTTP Federation）

**出站**: `messages.ts` route → `messageService.send()` → `federationDeliveryService.enqueue(envelope)` → HTTP POST 到 `{targetDomain}/api/v1/federation/envelopes`

**入站**: HTTP POST `/api/v1/federation/envelopes` → `federationService.receiveEnvelope()` → `messageService.ingestFederatedEnvelope()`

### 目标消息流（P2P + HTTP fallback）

**出站**: `messages.ts` route → `messageService.send()` → `clawnetTransportService.sendEnvelope()` → 成功则完成，失败则 fallback → `federationDeliveryService.enqueue()`

**入站**: 
- P2P: `clawnetTransportService.startListening()` via WS subscribe → `messageService.ingestFederatedEnvelope()`
- HTTP: 保留现有入站路由不变

---

## 关键文件清单

| 文件 | 作用 | 操作 |
|------|------|------|
| `packages/node/src/services/federation-delivery-service.ts` | 当前 HTTP 出站投递 | **保留**（作为 fallback） |
| `packages/node/src/services/clawnet-transport-service.ts` | P2P 传输适配器 | **新建** |
| `packages/node/src/app.ts` L218-224 | FederationDeliveryService 实例化 | **修改**：增加 ClawNetTransportService 实例化 |
| `packages/node/src/app.ts` L250-262 | RuntimeContext 构建 | **修改**：添加 clawnetTransportService |
| `packages/node/src/app.ts` L286 | 服务启动 | **修改**：启动 P2P 监听 |
| `packages/node/src/app.ts` L309 | 服务关闭 | **修改**：关闭 P2P 连接 |
| `packages/node/src/api/types.ts` L34 | RuntimeContext 类型 | **修改**：添加 clawnetTransportService 字段 |
| `packages/node/src/api/routes/messages.ts` L37-42 | 消息发送时入队 | **修改**：先走 P2P，失败走 HTTP |
| `packages/node/src/api/routes/federation.ts` L70-79 | federation submit 时入队 | **修改**：同上 |
| `packages/protocol/src/types.ts` L28-30 | RouteHint 类型 | **修改**：添加 `targetDid?: string`（兼容期保留 targetDomain） |
| `packages/node/src/config.ts` | 配置 | **修改**：添加 transport mode 配置 |
| `packages/node/src/clawnet/gateway-service.ts` | ClawNetClient 封装 | **只读引用**：`client.messaging` |

---

## SDK 接口速查（`@claw-network/sdk@0.3.0`）

```typescript
// ClawNetClient.messaging 上的方法：
client.messaging.send(params: SendMessageParams): Promise<SendMessageResult>
client.messaging.sendBatch(params: SendBatchParams): Promise<SendBatchResult>
client.messaging.inbox(params?: InboxQueryParams): Promise<InboxResponse>
client.messaging.ack(messageId: string): Promise<void>
client.messaging.peers(): Promise<DidPeerMapResponse>

// 关键类型：
interface SendMessageParams {
  targetDid: string; topic: string; payload: string;
  ttlSec?: number; priority?: number; compress?: boolean;
  encryptForKeyHex?: string; idempotencyKey?: string;
}
interface SendMessageResult { messageId: string; delivered: boolean; compressed?: boolean; encrypted?: boolean; }
interface InboxMessage { messageId: string; sourceDid: string; topic: string; payload: string; receivedAtMs: number; priority: number; seq: number; }
```

WebSocket 端点: `WS /api/v1/messaging/subscribe?topic=telagent/envelope&sinceSeq=N`

---

## Task List（按顺序执行）

### Task 1: RouteHint 类型扩展
- 文件: `packages/protocol/src/types.ts`
- 在 `RouteHint` 接口中添加 `targetDid?: string`（保留 `targetDomain` 向后兼容）
- 确保 protocol 包编译通过

### Task 2: 新增 transport mode 配置
- 文件: `packages/node/src/config.ts`
- 新增 env var: `TELAGENT_TRANSPORT_MODE`，取值 `p2p-first`（默认） | `http-only` | `p2p-only`
- 添加到 config 对象

### Task 3: 实现 ClawNetTransportService
- 新建: `packages/node/src/services/clawnet-transport-service.ts`
- 参考 RFC §C.6 的完整代码模板
- 核心功能:
  - `sendEnvelope(targetDid, envelope)` — 调用 `client.messaging.send()`，用 `envelopeId` 作 `idempotencyKey`
  - `sendEnvelopeMulticast(targetDids, envelope)` — 调用 `client.messaging.sendBatch()`
  - `startListening(onEnvelope)` — WS 订阅 `telagent/envelope`，带 `sinceSeq` 断线重连
  - `stopListening()` — 关闭 WS
- 构造依赖: ClawNetGatewayService（取 `.client`）、ClawNet baseUrl/apiKey

### Task 4: 服务注册 & 生命周期
- 文件: `packages/node/src/app.ts`
- 在 `TelagentNode.start()` 中实例化 `ClawNetTransportService`
- 调用 `startListening()`，回调接入 `messageService.ingestFederatedEnvelope()`
- 在 `stop()` 中调用 `stopListening()`
- 将 service 注入 `RuntimeContext`

### Task 5: RuntimeContext 类型更新
- 文件: `packages/node/src/api/types.ts`
- 添加 `clawnetTransportService?: ClawNetTransportService`

### Task 6: 出站消息改造（双通道）
- 文件: `packages/node/src/api/routes/messages.ts`
- 发送消息后：先尝试 P2P（`clawnetTransportService.sendEnvelope()`），失败则 fallback 到 HTTP（`federationDeliveryService.enqueue()`）
- 需要从 envelope 的 `routeHint` 中获取 `targetDid`（如没有则只走 HTTP）
- 文件: `packages/node/src/api/routes/federation.ts` L70-79 — 同样逻辑

### Task 7: 编译验证
- `pnpm -r build` 全量编译无报错
- `pnpm --filter @telagent/node test` 现有测试不破坏

### Task 8: 端到端验证（可选）
- 本地启动节点，确认 P2P 监听初始化成功
- 如有两个 ClawNet 节点可测试跨节点消息

---

## 注意事项

1. **不要删除任何 Federation 代码** — 第一阶段是双通道并行
2. **`routeHint.targetDid` 可选** — 旧消息没有这个字段，需要优雅降级到 HTTP
3. **ClawNetGatewayService 已在 app.ts 中实例化**（`this.clawnetGateway`），直接用 `.client.messaging`
4. **WS 重连** — 参考 RFC §C.6 代码模板的 `ws.on('close', () => setTimeout(...))` 模式
5. **日志** — 用现有的 `logger`（`import { logger } from '../logger.js'`）
6. **测试** — `federation-delivery-service.test.ts` 已有完整测试模式可参考
