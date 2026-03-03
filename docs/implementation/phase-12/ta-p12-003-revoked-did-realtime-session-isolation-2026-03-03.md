# TA-P12-003 revoked DID 实时会话隔离（订阅+驱逐）（2026-03-03）

- Task ID：TA-P12-003
- 阶段：Phase 12（v1.2 候选能力冻结与排程）
- 状态：DONE
- 负责人角色：Security + Backend

## 1. 目标

落地 revoked DID 事件驱动的实时会话隔离能力，满足以下最小验收：

1. revoked DID 事件进入后，相关会话进入隔离态（subscription）；
2. 被撤销 DID 的新消息发送被拒绝（标准错误码 + RFC7807）；
3. 隔离与驱逐过程可审计（用于运营/安全追踪）；
4. 覆盖单测、API 契约测试与专项检查脚本。

## 2. 实现范围

### 2.1 身份侧 revocation 事件发布/订阅

- 更新：`packages/node/src/services/identity-adapter-service.ts`
- 新增：
  - `DidRevocationEvent` / `DidRevocationListener`
  - `subscribeDidRevocations(listener)`
  - `notifyDidRevoked(did, options)`
- 行为：
  - 支持外部事件注入（Node API/运维通道）；
  - `assertActiveDid` 检测到 revoked/inactive 时，自动发出 revocation 事件。

### 2.2 MessageService 会话隔离 + 驱逐 + 审计

- 更新：`packages/node/src/services/message-service.ts`
- 新增能力：
  - 订阅 revocation 事件并执行会话隔离；
  - 维护 `revokedDidHashes`、`isolatedConversationById`、`isolationEvents`；
  - 驱逐活跃会话缓存（`activeConversationIds`）并记录驱逐计数；
  - `send()` 在隔离态下拒绝发送（`UNPROCESSABLE_ENTITY`）；
  - 审计接口：
    - `listIsolatedConversations(limit)`
    - `listIsolationEvents(limit)`
    - `buildAuditSnapshot()` 扩展隔离指标（`revokedDidCount`、`isolatedConversationCount`、`isolationEventCount`）。

### 2.3 Node API revocation 事件入口（/api/v1/*）

- 更新：`packages/node/src/api/routes/node.ts`
- 新增接口：`POST /api/v1/node/revocations`
- 入参：
  - `did`（必须 `did:claw:*`）
  - `source`（可选）
  - `revoked_at_ms`（可选，正整数）
- 返回：
  - `{ data: { revocation }, links }`
- 错误处理：
  - 入参非法统一 RFC7807（`application/problem+json`）。

## 3. 测试与校验

### 3.1 单测

- 更新：`packages/node/src/services/message-service.test.ts`
  - `TA-P12-003 revoked DID event isolates related sessions and evicts active sessions`
  - `TA-P12-003 buildAuditSnapshot includes revocation isolation evidence`

### 3.2 API 契约/前缀测试

- 更新：`packages/node/src/api-contract.test.ts`
  - `TA-P12-003 revoked DID event isolates session and rejects message send with RFC7807`
- 更新：`packages/node/src/api-prefix.test.ts`
  - 覆盖 `/api/v1/node/revocations` 与 `/v1/node/revocations` 前缀校验。

### 3.3 Phase 12 专项检查脚本

- 新增：`packages/node/scripts/run-phase12-revoked-did-isolation-check.ts`
- 校验项：
  1. revocation 事件接收并入库隔离记录；
  2. direct/group 关联会话被隔离并驱逐；
  3. revoked DID 发送被 `UNPROCESSABLE_ENTITY` 拒绝；
  4. 审计快照包含 isolation 指标。
- 机读清单：`docs/implementation/phase-12/manifests/2026-03-03-p12-revoked-did-isolation-check.json`

## 4. 执行命令

```bash
corepack pnpm --filter @telagent/node build
corepack pnpm --filter @telagent/node test
corepack pnpm --filter @telagent/node exec tsx scripts/run-phase12-revoked-did-isolation-check.ts
```

## 5. 证据

- 代码：
  - `packages/node/src/services/identity-adapter-service.ts`
  - `packages/node/src/services/message-service.ts`
  - `packages/node/src/services/message-service.test.ts`
  - `packages/node/src/api/routes/node.ts`
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/src/api-prefix.test.ts`
  - `packages/node/src/app.ts`
  - `packages/node/scripts/run-phase12-revoked-did-isolation-check.ts`
- 日志：
  - `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-revoked-did-isolation-check-run.txt`
- 清单：
  - `docs/implementation/phase-12/manifests/2026-03-03-p12-revoked-did-isolation-check.json`

## 6. 结论

- `TA-P12-003`：PASS
- revoked DID 事件链路已从“发送前被动校验”升级为“事件订阅 + 会话隔离 + 驱逐 + 审计追踪”，满足本轮验收标准。
