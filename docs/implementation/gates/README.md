# TelAgent v1 Phase Gate 目录

- 文档版本：v1.1
- 目的：统一记录每个 Phase 的 Gate 评审结论，作为下一阶段启动依据

## 1. 使用规则

1. 每个 Phase 结束必须产出 1 份 Gate 记录。
2. Gate 结论只能是：`PASS`、`CONDITIONAL PASS`、`FAIL`。
3. 结论为 `CONDITIONAL PASS` 时，必须附补丁项与截止日期。
4. 结论为 `FAIL` 时，不得进入下一阶段。
5. 每份 Gate 记录必须有负责人签字（至少 TL + 对应 Phase 负责人）。

## 2. 文件清单

- `phase-gate-template.md`：通用模板（复制后填写）
- `risk-register-template.md`：风险清单模板（Gate 会前/会后更新）
- `phase-0-risk-register.md`：Phase 0 风险清单（Week 1 实例）
- `phase-0-gate.md`：Phase 0 评审记录
- `phase-1-gate.md`：Phase 1 评审记录
- `phase-2-gate.md`：Phase 2 评审记录
- `phase-3-gate.md`：Phase 3 评审记录
- `phase-4-gate.md`：Phase 4 评审记录
- `phase-5-gate.md`：Phase 5 评审记录
- `phase-6-gate.md`：Phase 6 评审记录
- `phase-7-gate.md`：Phase 7 评审记录
- `phase-8-gate.md`：Phase 8 评审记录
- `phase-9-gate.md`：Phase 9 评审记录
- `phase-10-gate.md`：Phase 10 评审记录
- `phase-11-gate.md`：Phase 11 评审记录
- `phase-12-gate.md`：Phase 12 评审记录
- `phase-13-gate.md`：Phase 13 评审记录
- `phase-14-gate.md`：Phase 14 评审记录
- `phase-15-gate.md`：Phase 15 评审记录
- `phase-16-gate.md`：Phase 16 评审记录

## 3. 推荐流程

1. 会前 24 小时收集证据（测试报告、部署记录、回滚演练结果）。
2. 评审会中逐条核对 Exit Criteria。
3. 会后 2 小时内发布 Gate 结论并更新 WBS 状态。
