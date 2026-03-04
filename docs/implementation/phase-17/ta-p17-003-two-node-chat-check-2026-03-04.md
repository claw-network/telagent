# TA-P17-003 双节点云端聊天联调检查（2026-03-04）

- Task ID：TA-P17-003
- 状态：DONE
- 日期：2026-03-04

## 目标

在两台独立云节点上验证跨节点自动投递闭环：

- A -> B 可达
- B -> A 可达
- 输出机读报告用于 Gate 收口

## 已完成

- 双云节点完成部署与联调环境准备（`alex.telagent.org` / `bess.telagent.org`）
- 联调脚本执行完成并生成机读报告：`docs/implementation/phase-17/cross-node-chat-check-report.json`
- 报告结论为 `PASS`，A->B / B->A 均验证通过
- 运行与排障命令已固化到执行清单：`docs/implementation/phase-17/two-node-one-click-checklist-2026-03-04.md`
- 固定 runbook 已归档：`docs/implementation/phase-17/two-node-cloud-runtime-2026-03-04.md`

## 实机运行参数（已验证）

| 节点 | 域名 | IP | URL | DID |
| --- | --- | --- | --- | --- |
| Node A | `alex.telagent.org` | `173.249.46.252` | `https://alex.telagent.org` | `did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn` |
| Node B | `bess.telagent.org` | `167.86.93.216` | `https://bess.telagent.org` | `did:claw:z7ToozkCFGsnkJB5HDub6J7cN5EKAxcr4CHfPiazcLkFw` |

## 验收结果

- 运行脚本：`pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts`
- 报告时间：`2026-03-04T14:12:31.469Z`
- 结果：`decision = PASS`
- 明细：
  - `checks.nodeAToNodeB.delivered = true`（`latencyMs = 1656`）
  - `checks.nodeBToNodeA.delivered = true`（`latencyMs = 324`）

## 关键输出

- 报告文件：`docs/implementation/phase-17/cross-node-chat-check-report.json`
- 回归日志：`docs/implementation/phase-17/logs/2026-03-04-p17-node-test.txt`

## 后续动作

- `TA-P17-004` 已完成收口（见 `docs/implementation/phase-17/ta-p17-004-phase17-gate-prep-2026-03-04.md`）
