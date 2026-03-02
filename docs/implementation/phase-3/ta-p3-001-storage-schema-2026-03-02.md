# TA-P3-001 索引存储表结构检查点（2026-03-02）

- Task ID：TA-P3-001
- 阶段：Phase 3
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

设计并创建 Phase 3 读模型与索引状态存储结构，满足：

- `groups/group_members/group_events` 就绪
- 支持 indexer 断点续跑与 reorg 检测

## 2. 实现

- 核心文件：`packages/node/src/storage/group-repository.ts`
- 新增/确认表：
  - `groups`
  - `group_members`
  - `group_chain_state`
  - `group_events`
  - `indexer_state`（last indexed block/hash, reorg count）
  - `indexed_blocks`（block hash/parent hash 追踪）
- 新增能力：
  - `listGroups()`
  - `listAllEvents()`
  - `deleteEventsAfterBlock()`
  - `clearReadModel()`
  - `save/getIndexerState()`
  - `record/get/delete indexed block` 相关方法

## 3. 验证结果

- `@telagent/node` build 通过
- 日志：`docs/implementation/phase-3/logs/2026-03-02-p3-node-build.txt`
- 结论：Phase 3 所需存储基础就绪。

## 4. 下一步

推进 `TA-P3-002`（事件订阅与解码）与 `TA-P3-005`（回滚重放）。
