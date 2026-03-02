# TA-P3-006 reorg 注入测试报告（2026-03-02）

- Task ID：TA-P3-006
- 阶段：Phase 3
- 状态：DONE
- 负责人角色：QA Engineer

## 1. 目标

通过注入分叉链场景，验证 indexer 回滚与重放正确性。

## 2. 测试实现

- 文件：`packages/node/src/indexer/group-indexer.test.ts`
- 用例：
  - `reorg rollback replays canonical events and restores deterministic view`
- 验证点：
  - 分叉后旧 pending 成员被剔除
  - canonical 分支成员状态正确
  - `reorgCount` 递增

## 3. 测试结果

- 日志：`docs/implementation/phase-3/logs/2026-03-02-p3-node-test.txt`
- 结果：PASS

## 4. 下一步

推进 `TA-P3-007` 一致性巡检并准备 Gate。
