# TA-P3-002 GroupIndexer 事件订阅与解码检查点（2026-03-02）

- Task ID：TA-P3-002
- 阶段：Phase 3
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现 GroupIndexer 对合约事件的持续订阅、解码与落库。

## 2. 实现

- 核心文件：`packages/node/src/indexer/group-indexer.ts`
- 能力点：
  - `catchUp()` 按块区间拉取日志并解析事件
  - 事件落库到 `group_events`
  - 事件驱动更新 `groups/group_members/group_chain_state`
  - 启动时支持持久化断点恢复（`indexer_state`）

## 3. 验证结果

- 单测：`packages/node/src/indexer/group-indexer.test.ts`
- 用例覆盖：
  - finality 窗口内事件可被消费并写入视图
  - reorg 后按 canonical 链重放恢复
- 日志：`docs/implementation/phase-3/logs/2026-03-02-p3-node-test.txt`

## 4. 下一步

推进 `TA-P3-003` 与 `TA-P3-004` 收口。
