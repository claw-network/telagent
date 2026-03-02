# TelAgent v1 Week 1 收口执行排程（Phase 0）

- 文档版本：v1.0
- 适用日期：2026-03-03 ~ 2026-03-08（UTC+8）
- 范围限制：仅 Phase 0（`TA-P0-001` ~ `TA-P0-008`）
- 目标：关闭 Phase 0 Gate 补丁项，使 `phase-0-gate.md` 满足转 `PASS` 条件

## 1. 当前起点（2026-03-02 结束时）

1. WBS：`TA-P0-001` ~ `TA-P0-008` 已标记 `DONE`。
2. Gate：`CONDITIONAL PASS`，存在 2 项补丁待关闭。
3. 硬约束：未关闭补丁前不得进入 Phase 1。

## 2. 补丁项关闭清单（必须全部 Closed）

| Patch ID | 项目 | Owner | 截止日期 | 关闭标准 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| P0-PATCH-001 | 网络恢复后补跑 `pnpm install && pnpm -r build && pnpm -r test` | TL + QA | 2026-03-08 | 三条命令执行完成且日志归档 | Open |
| P0-PATCH-002 | Gate 签字由角色占位改为实名 | TL | 2026-03-08 | `phase-0-gate.md` 签字字段为实名 | Open |

## 3. 日程排程（直接执行版）

## 2026-03-03（周二）

- TL：确认 npm/GitHub 网络与凭据修复责任人，登记到风险清单。
- QA：创建日志归档目录与日志文件命名规范。
- 输出：
  - `docs/implementation/gates/risk-register-template.md` 实际化副本（团队可选文件）
  - 基线命令执行计划（命令 + 时间 + 执行人）

## 2026-03-04（周三）

- QA：执行第一次基线重跑（install/build/test）。
- TL：在 14:00 同步会更新 `P0-PATCH-001` 进展。
- 输出：
  - `docs/implementation/phase-0/day1-baseline-check.md` 追加“复跑记录”章节
  - 若仍失败，补充失败根因与责任人

## 2026-03-05（周四）

- PO/SE/BE：对 Phase 0 规范文档做最终交叉审阅（仅查错不改约束）。
- TL：准备 Gate 复核议程和签字页。
- 输出：
  - `phase-0-gate.md` 复核议程草案（可放备注）

## 2026-03-06（周五）

- QA：执行第二次基线重跑（如周三未通过）。
- TL：核对补丁关闭证据是否满足“可复查、可定位、可追溯”。
- 输出：
  - 基线结果最终结论（通过/阻塞）

## 2026-03-07（周六）

- TL：预演 Gate 复核材料，确认签字人可出席。
- QA：确认测试证据链接可打开。
- 输出：
  - Gate 会前材料包（文档链接清单）

## 2026-03-08（周日）

- 14:00（UTC+8）中途同步（一次）：确认补丁项状态。
- 18:00（UTC+8）Phase 0 Gate 复核（一次）：
  1. 逐条核对 Exit Criteria
  2. 逐条核对补丁项
  3. 更新 Gate 结论
- 输出：
  - `docs/implementation/gates/phase-0-gate.md` 最终结论（目标：`PASS`）

## 4. 统一回报格式（执行中强制）

每次同步严格按以下 5 项：

1. Task ID
2. 状态（`TODO` / `IN_PROGRESS` / `BLOCKED` / `DONE`）
3. 证据链接（文档路径 / PR / 测试日志）
4. 阻塞项
5. 下一步动作

## 5. 执行命令模板（P0-PATCH-001）

建议在仓库根目录执行并保存输出：

```bash
pnpm install 2>&1 | tee docs/implementation/phase-0/logs/2026-03-XX-pnpm-install.log
pnpm -r build 2>&1 | tee docs/implementation/phase-0/logs/2026-03-XX-pnpm-build.log
pnpm -r test 2>&1 | tee docs/implementation/phase-0/logs/2026-03-XX-pnpm-test.log
```

## 6. 放行判据（进入 Phase 1 之前）

仅当以下条件同时满足，才允许启动 Phase 1：

1. `phase-0-gate.md` 结论为 `PASS`，或 `CONDITIONAL PASS` 且补丁项全部 `Closed`。
2. `TA-P0-001` ~ `TA-P0-008` 证据链接可复查。
3. Gate 签字为实名（TL/PO/QA）。
