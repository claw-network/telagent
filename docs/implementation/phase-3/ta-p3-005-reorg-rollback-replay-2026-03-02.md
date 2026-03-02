# TA-P3-005 reorg 检测与回滚重放检查点（2026-03-02）

- Task ID：TA-P3-005
- 阶段：Phase 3
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现重组检测、回滚到共同祖先并重放事件，恢复确定性视图。

## 2. 实现

- 核心文件：`packages/node/src/indexer/group-indexer.ts`
- 关键流程：
  - `ensureCanonicalHead()`：比对 last indexed hash 与链上 hash
  - `findCommonAncestor()`：回溯共同祖先
  - `rollbackAndReplay()`：
    - 删除祖先之后事件/索引块
    - 清空读模型
    - 重放保留事件恢复状态
    - `reorgCount+1`
- 数据恢复脚本：`packages/node/scripts/rebuild-group-read-model.ts`

## 3. 验证结果

- reorg 注入测试通过：`docs/implementation/phase-3/logs/2026-03-02-p3-node-test.txt`
- 重建脚本运行日志：`docs/implementation/phase-3/logs/2026-03-02-p3-rebuild-read-model-run.txt`
- 结论：重组后可恢复一致视图，且具备离线重建脚本。

## 4. 下一步

推进 `TA-P3-006`（注入测试报告）与 `TA-P3-007`（一致性巡检）。
