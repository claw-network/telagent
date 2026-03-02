# TA-P3-004 finalityDepth 处理逻辑检查点（2026-03-02）

- Task ID：TA-P3-004
- 阶段：Phase 3
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

确保仅在确认深度后写入 finalized 视图。

## 2. 实现

- 核心文件：`packages/node/src/indexer/group-indexer.ts`
- 核心逻辑：
  - `targetBlock = max(0, head - finalityDepth)`
  - 仅处理 `lastIndexedBlock+1 ~ targetBlock` 区间
  - 启动 bootstrap 默认定位到 `head-finalityDepth`，避免无状态全链扫描

## 3. 验证结果

- 单测：`finalityDepth only materializes finalized blocks`
- 日志：`docs/implementation/phase-3/logs/2026-03-02-p3-node-test.txt`
- 结论：finalityDepth 策略生效。

## 4. 下一步

推进 `TA-P3-005` reorg 回滚重放。
