# TA-P4-004 离线邮箱 TTL 清理任务（2026-03-03）

- Task ID：TA-P4-004
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现离线邮箱过期消息清理能力，避免邮箱无限增长，并保证过期后 dedupe key 可释放。

## 2. 实现

- `MessageService` 新增清理能力：`packages/node/src/services/message-service.ts`
  - `cleanupExpired()`：清理过期 envelope，返回 `{removed, remaining, sweptAtMs}`
  - `pull()` / `send()` 调用前触发清理，保证读写视图不含过期项
- Node 定时清理任务：`packages/node/src/app.ts`
  - 节点启动时创建清理定时器
  - 停止节点时清理定时器
- 配置扩展：
  - `packages/node/src/config.ts` 新增 `mailboxCleanupIntervalSec`
  - `.env.example` 新增 `TELAGENT_MAILBOX_CLEANUP_INTERVAL_SEC`（默认 60）
- 新增单测：`packages/node/src/services/message-service.test.ts`
  - `TA-P4-004 cleanupExpired removes expired envelopes and releases dedupe key`

## 3. 验证结果

- Node 构建日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-build.txt`
- Node 测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
- 结论：TTL 清理任务生效，过期 envelope 与 dedupe key 可正确回收。

## 4. 下一步

进入 `TA-P4-005`（provisional 标记/剔除逻辑）。
