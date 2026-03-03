# TA-P11-006 Signal/MLS 密钥生命周期管理（2026-03-03）

- Task ID：TA-P11-006
- 阶段：Phase 11（v1.1 安全与运营能力增强）
- 状态：DONE
- 负责人角色：Protocol + Backend

## 1. 目标

为 TelAgent 消息链路补齐可验证的密钥生命周期能力，覆盖 Signal（私聊）与 MLS（群聊）：

1. 支持密钥注册、轮换、撤销、恢复四类核心操作；
2. 为轮换提供 grace window，允许平滑切流；
3. 在消息发送前做生命周期校验，阻断 revoked/失效密钥继续发送。

## 2. 实现

### 2.1 KeyLifecycleService（核心状态机）

- 新增：`packages/node/src/services/key-lifecycle-service.ts`
- 状态：
  - `ACTIVE`
  - `ROTATING`
  - `REVOKED`
  - `RECOVERED`
- 核心方法：
  - `registerKey`
  - `rotateKey`
  - `revokeKey`
  - `recoverKey`
  - `assertCanUseKey`
  - `listKeys`
- 约束：
  - DID 必须为 `did:claw:*`
  - `keyId` 必须满足格式校验
  - `publicKey` 必须为 hex
  - 冲突/非法状态切换返回 `TelagentError`，并映射到 RFC7807。

### 2.2 API 暴露（全量 `/api/v1/*`）

- 新增路由：`packages/node/src/api/routes/keys.ts`
- 挂载：`packages/node/src/api/server.ts`
- 接口：
  - `POST /api/v1/keys/register`
  - `POST /api/v1/keys/rotate`
  - `POST /api/v1/keys/revoke`
  - `POST /api/v1/keys/recover`
  - `GET /api/v1/keys/{did}?suite=signal|mls`
- 成功响应保持 `{ data, links? }` envelope；错误保持 RFC7807。

### 2.3 MessageService 接入生命周期校验

- 更新：`packages/node/src/services/message-service.ts`
- 行为：
  - `conversationType=direct` -> 使用 `signal` 套件校验；
  - `conversationType=group` -> 使用 `mls` 套件校验；
  - 将现有 `mailboxKeyId` 作为生命周期校验的 `keyId`；
  - 校验失败返回 `FORBIDDEN`，阻断发送。

### 2.4 运行时依赖注入与导出

- 更新：
  - `packages/node/src/app.ts`
  - `packages/node/src/api/types.ts`
  - `packages/node/src/index.ts`
- 结果：API 层与服务层统一通过 `RuntimeContext.keyLifecycleService` 访问生命周期能力。

### 2.5 测试与校验脚本

- 新增测试：`packages/node/src/services/key-lifecycle-service.test.ts`
  - 轮换 grace 生效与过期失效
  - 撤销/恢复可验证
  - DID/keyId 非法输入拒绝
- 更新测试：
  - `packages/node/src/services/message-service.test.ts`
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/src/api-prefix.test.ts`
  - `packages/node/src/phase4-e2e.test.ts`
- 新增脚本：`packages/node/scripts/run-phase11-key-lifecycle-check.ts`
  - 输出机读清单用于 Gate 复核。

## 3. 执行命令

```bash
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
pnpm --filter @telagent/node exec tsx scripts/run-phase11-key-lifecycle-check.ts
```

## 4. 证据

- 代码：
  - `packages/node/src/services/key-lifecycle-service.ts`
  - `packages/node/src/services/key-lifecycle-service.test.ts`
  - `packages/node/src/api/routes/keys.ts`
  - `packages/node/src/services/message-service.ts`
  - `packages/node/src/services/message-service.test.ts`
  - `packages/node/scripts/run-phase11-key-lifecycle-check.ts`
- 日志：
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-key-lifecycle-check-run.txt`
- 清单：
  - `docs/implementation/phase-11/manifests/2026-03-03-p11-key-lifecycle-check.json`

## 5. 结论

- `TA-P11-006`：PASS
- 轮换/撤销/恢复流程已具备可验证证据，消息发送已可基于 Signal/MLS 生命周期状态做发送前阻断。
