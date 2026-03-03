# TA-P4-010 E2E 离线 24h 拉取与去重排序（2026-03-03）

- Task ID：TA-P4-010
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：QA Engineer / Backend Engineer

## 1. 目标

验证离线拉取场景在 24 小时后仍满足以下约束：

1. `envelopeId` 去重幂等（重复发送不重复入箱）
2. 同会话 `conversationId + seq` 有序
3. 分页拉取时顺序稳定且无重复

## 2. 实现

- 在 `packages/node/src/phase4-e2e.test.ts` 新增离线场景测试：
  - 先完成建群/邀请/接受，构造 ACTIVE 群聊上下文。
  - 发送消息 `env-p4-010-1` 后重复发送同 payload，验证幂等不重复。
  - 追加 `env-p4-010-2`、`env-p4-010-3`，形成连续序列。
  - 通过可控时钟推进 `24h + 1s`，模拟离线窗口。
  - 以 `limit=2` 进行两页拉取，验证 `cursor` 分页与顺序稳定。

## 3. 验证结果

- 新增测试用例：
  - `TA-P4-010 E2E offline 24h pull keeps dedupe and per-conversation order`
- 断言结果：
  - 仅保留 3 条唯一 envelope（去重生效）
  - seq 顺序严格为 `1,2,3`
  - 24h 后消息仍可拉取（TTL 未过期）
- 证据日志：
  - `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
  - `docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt`

## 4. 下一步

推进 `TA-P4-011`（<=500 成员群压测与容量评估）。
