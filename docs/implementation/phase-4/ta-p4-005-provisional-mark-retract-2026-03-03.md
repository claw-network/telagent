# TA-P4-005 provisional 消息标记/剔除逻辑（2026-03-03）

- Task ID：TA-P4-005
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现链失败/reorg 场景下 provisional 消息的剔除机制，确保 canonical 视图不包含未确权消息。

## 2. 实现

- `MessageService` 增加 provisional 回收机制：`packages/node/src/services/message-service.ts`
  - 新增 `retractProvisionalOnReorg()`
  - 新增 `listRetracted()` 用于读取被剔除消息记录
  - 新增 `runMaintenance()`，统一执行 TTL 清理 + provisional reorg 剔除
- 发送逻辑增强：
  - 群链状态为 `REORGED_BACK` 时拒绝发送（`CONFLICT`）
  - 若 `envelopeId` 命中已回收记录，保持冲突语义，防止歧义重放
- 节点定时任务更新：`packages/node/src/app.ts`
  - 从 `cleanupExpired()` 升级为 `runMaintenance()`，定时执行 TTL + provisional 回收
- 新增测试：`packages/node/src/services/message-service.test.ts`
  - `TA-P4-005 provisional envelopes are retracted when group is reorged back`
  - `TA-P4-005 send is rejected when group chain state is REORGED_BACK`

## 3. 验证结果

- Node 测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
- 全仓测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt`
- 结论：reorg 后 provisional 消息可从 canonical 视图剔除，且 reorg 状态下发送被拒绝。

## 4. 下一步

推进 `TA-P4-006`（附件清单校验加强）与 `TA-P4-007`（联邦接口安全硬化）。
