# TA-P3-007 链上 vs 读模型一致性巡检（2026-03-02）

- Task ID：TA-P3-007
- 阶段：Phase 3
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现一致性巡检脚本，对比链上群状态与读模型状态，输出可归档报告。

## 2. 实现

- 巡检脚本：`packages/node/scripts/run-phase3-consistency-check.ts`
  - 读取 Phase 2 集成 manifest
  - 回放对应块窗口的群事件到读模型
  - 查询链上 `getGroup/getMemberState`
  - 输出 mismatch 报告

## 3. 验证结果

- 运行日志：`docs/implementation/phase-3/logs/2026-03-02-p3-consistency-check-run.txt`
- 巡检清单：`docs/implementation/phase-3/manifests/2026-03-02-p3-consistency-check.json`
- 关键结果：`mismatchCount=0`

## 4. 下一步

进入 `TA-P3-008` Gate 评审。
