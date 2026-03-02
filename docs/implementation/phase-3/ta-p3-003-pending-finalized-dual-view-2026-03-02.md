# TA-P3-003 pending/finalized 双视图查询检查点（2026-03-02）

- Task ID：TA-P3-003
- 阶段：Phase 3
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现同一群在 pending/finalized 视图间可切换查询。

## 2. 实现

- 读模型过滤能力：`packages/node/src/storage/group-repository.ts`
  - `listMembers(groupId, state?)` 支持按状态过滤
- API 查询能力：`packages/node/src/api/routes/groups.ts`
  - `GET /api/v1/groups/:groupId/members?view=pending|finalized|all`
- 验证补强：`packages/node/src/indexer/group-indexer.test.ts`
  - 在同一群上同时断言 `PENDING` 与 `FINALIZED` 视图可独立查询

## 3. 验证结果

- 测试日志：`docs/implementation/phase-3/logs/2026-03-02-p3-node-test.txt`
- 结论：双视图查询能力满足 Phase 3 验收要求。

## 4. 下一步

推进 `TA-P3-004` finalityDepth 与 `TA-P3-007` 一致性巡检。
