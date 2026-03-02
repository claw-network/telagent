# TA-P0-008 建立阶段 Gate 模板与评审机制

- Task ID：TA-P0-008
- 负责人角色：Tech Lead / PM
- 状态：DONE
- 完成日期：2026-03-02

## 1. 目标

统一各阶段 Gate 的输入、判据、结论与补丁项追踪方式，避免“口头放行”和跨阶段执行。

## 2. 固定机制

1. 每个 Phase 结束必须落地 1 份 Gate 记录。
2. Gate 结论只能是：`PASS`、`CONDITIONAL PASS`、`FAIL`。
3. `CONDITIONAL PASS` 必须列出补丁项、owner、截止日期、验收标准。
4. `FAIL` 时禁止进入下一阶段。
5. Gate 未明确结论前，不得切换阶段。

## 3. 统一模板

- Gate 模板：`docs/implementation/gates/phase-gate-template.md`
- 风险清单模板：`docs/implementation/gates/risk-register-template.md`
- Phase 0 记录：`docs/implementation/gates/phase-0-gate.md`

## 4. Day 1 执行节奏（UTC+8）

- 14:00：中途同步（一次）
- 18:00：Phase 0 Gate（一次）

同步回报格式（按任务 ID）：

1. Task ID
2. 状态（`TODO`/`IN_PROGRESS`/`BLOCKED`/`DONE`）
3. 证据链接
4. 阻塞项
5. 下一步动作

## 5. 与 Day 2 的关系

- Day 2 不自动进入 Phase 1。
- 仅当 `phase-0-gate.md` 结论为 `PASS`，或 `CONDITIONAL PASS` 且补丁项全部关闭后，才允许进入 Phase 1。

## 6. 证据

- Gate 目录说明：`docs/implementation/gates/README.md`
- Day 1 接力清单：`docs/implementation/telagent-v1-agent-handoff-day1.md`
