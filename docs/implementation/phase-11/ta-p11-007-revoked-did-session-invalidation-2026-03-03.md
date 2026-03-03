# TA-P11-007 revoked DID 会话失效链路（2026-03-03）

- Task ID：TA-P11-007
- 阶段：Phase 11（v1.1 安全与运营能力增强）
- 状态：DONE
- 负责人角色：Security + Backend

## 1. 目标

落地 revoked DID 的链下会话失效机制，确保被撤销身份无法继续发送新消息，满足 Phase 11 身份强约束。

验收关键点：

1. send 前必须校验 DID active 状态；
2. DID 被撤销后，新消息发送必须被拒绝；
3. 已入箱历史消息保留，但撤销后不会新增同会话消息。

## 2. 实现

### 2.1 MessageService 引入身份活性校验

- 更新：`packages/node/src/services/message-service.ts`
- 新增 `MessageIdentityService` 抽象：
  - `assertActiveDid(rawDid)`
- `send()` 新增强校验：
  - 先验证 DID 格式；
  - 再调用 `identityService.assertActiveDid(senderDid)`；
  - revoked/inactive 直接抛错并阻断发送。

### 2.2 运行时接入 ClawIdentity 适配器

- 更新：`packages/node/src/app.ts`
- 在 `TelagentNode` 内将 `IdentityAdapterService` 注入 `MessageService`。
- 结果：线上路径默认执行链上身份活性校验，revoked DID 无法继续发消息。

### 2.3 自动化验证

- 更新测试：`packages/node/src/services/message-service.test.ts`
  - 用例：`TA-P11-007 revoked DID cannot continue sending new messages`
  - 覆盖“撤销前可发、撤销后拒绝、会话消息不新增”三段行为。
- 新增脚本：`packages/node/scripts/run-phase11-revoked-did-session-check.ts`
  - 产出机读清单，供 Gate 复核。

## 3. 执行命令

```bash
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
pnpm --filter @telagent/node exec tsx scripts/run-phase11-revoked-did-session-check.ts
```

## 4. 证据

- 代码：
  - `packages/node/src/services/message-service.ts`
  - `packages/node/src/services/message-service.test.ts`
  - `packages/node/src/app.ts`
  - `packages/node/scripts/run-phase11-revoked-did-session-check.ts`
- 日志：
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-revoked-did-session-check-run.txt`
- 清单：
  - `docs/implementation/phase-11/manifests/2026-03-03-p11-revoked-did-session-check.json`

## 5. 结论

- `TA-P11-007`：PASS
- revoked DID 已被纳入消息发送前强校验，撤销后无法继续发送新消息，满足“会话失效链路”验收标准。
