# TelAgent v1 Phase 17（Cross-node Delivery Hardening）

- 文档版本：v0.2
- 状态：DONE
- 最后更新：2026-03-04

## 1. 阶段目标

Phase 17 聚焦“两个独立节点可稳定互聊”的最后一公里加固：

1. 按既定规则完成 sequencer 归属与跨节点提交；
2. 把联邦出站从内存队列升级为持久化 outbox；
3. 用双云节点实机脚本输出可复核的 PASS/FAIL 报告；
4. 形成可交接的 Gate 草案与证据清单。

## 2. 任务状态

| Task ID | 状态 | 说明 | 关键证据 |
| --- | --- | --- | --- |
| TA-P17-001 | DONE | sequencer 归属 + 远端 sequencer 提交链路 | `packages/node/src/services/sequencer-domain.ts`, `packages/node/src/api/routes/messages.ts`, `packages/node/src/api/routes/federation.ts` |
| TA-P17-002 | DONE | 持久化 outbox（SQLite/Postgres）+ 重试退避 | `packages/node/src/services/federation-delivery-service.ts`, `packages/node/src/storage/message-repository.ts`, `packages/node/src/storage/postgres-message-repository.ts`, `packages/node/src/services/federation-delivery-service.test.ts` |
| TA-P17-003 | DONE | 双节点联调脚本与机读报告 | `packages/node/scripts/run-cross-node-chat-check.ts`, `docs/implementation/phase-17/cross-node-chat-check-report.json` |
| TA-P17-004 | DONE | Phase 17 Gate 收口 | `docs/implementation/gates/phase-17-gate.md` |

## 3. 当前阻塞（已解除）

- **当前阻塞**：无。
- **收口说明**：双云节点实机联调与 Gate 证据已完成归档。

## 4. 实机执行结果（2026-03-04）

- Node A：`alex.telagent.org`（`173.249.46.252`）
  - DID：`did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn`
- Node B：`bess.telagent.org`（`167.86.93.216`）
  - DID：`did:claw:z7ToozkCFGsnkJB5HDub6J7cN5EKAxcr4CHfPiazcLkFw`
- 联调结论：
  - `checks.nodeAToNodeB.delivered=true`
  - `checks.nodeBToNodeA.delivered=true`
  - `decision=PASS`
- 回归结果：
  - `pnpm --filter @telagent/node test`：`97 passed / 0 failed`
  - 日志：`docs/implementation/phase-17/logs/2026-03-04-p17-node-test.txt`

## 5. 机读产物

- `cross-node-chat-check-report.json`（已归档）

## 6. 任务文档

- `ta-p17-001-sequencer-routing-and-submit-2026-03-04.md`
- `ta-p17-002-persistent-federation-outbox-2026-03-04.md`
- `ta-p17-003-two-node-chat-check-2026-03-04.md`
- `ta-p17-004-phase17-gate-prep-2026-03-04.md`
- `two-node-one-click-checklist-2026-03-04.md`（含 nohup 与 systemd 两套命令清单）
- `two-node-cloud-runtime-2026-03-04.md`（本次实机参数与复跑 Runbook）
