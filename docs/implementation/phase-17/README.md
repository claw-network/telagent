# TelAgent v1 Phase 17（Cross-node Delivery Hardening）

- 文档版本：v0.2
- 状态：IN_PROGRESS
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
| TA-P17-003 | IN_PROGRESS | 双节点联调脚本与机读报告 | `packages/node/scripts/run-cross-node-chat-check.ts`, `docs/implementation/phase-17/cross-node-chat-check-report.json` |
| TA-P17-004 | TODO | Phase 17 Gate 收口 | `docs/implementation/gates/phase-17-gate.md` |

## 3. 当前阻塞

- **唯一阻塞**：缺少双云节点实机执行窗口与完整运行参数（URL / DID / domain）。
- **非阻塞项**：代码与单测回归已通过，等待环境证据补齐。

## 4. 接手执行指引（给下一个 agent）

1. 先运行回归：

```bash
pnpm --filter @telagent/node test
```

2. 在两台云节点准备以下环境变量：

```bash
export TELAGENT_NODE_A_URL=https://node-a.example.com
export TELAGENT_NODE_A_DID=did:claw:zNodeA
export TELAGENT_NODE_A_DOMAIN=node-a.example.com
export TELAGENT_NODE_B_URL=https://node-b.example.com
export TELAGENT_NODE_B_DID=did:claw:zNodeB
export TELAGENT_NODE_B_DOMAIN=node-b.example.com
```

3. 执行双节点联调脚本：

```bash
pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts
```

4. 校验并归档输出：

- 报告路径：`docs/implementation/phase-17/cross-node-chat-check-report.json`
- 通过标准：`checks.nodeAToNodeB.delivered=true` 且 `checks.nodeBToNodeA.delivered=true`

5. 完成 Gate 收口：

- 更新：`docs/implementation/gates/phase-17-gate.md`
- 同步：`docs/implementation/telagent-v1-task-breakdown.md`
- 同步：`docs/implementation/telagent-v1-iteration-board.md`

## 5. 机读产物

- `cross-node-chat-check-report.json`（待执行脚本后生成）

## 6. 任务文档

- `ta-p17-001-sequencer-routing-and-submit-2026-03-04.md`
- `ta-p17-002-persistent-federation-outbox-2026-03-04.md`
- `ta-p17-003-two-node-chat-check-2026-03-04.md`
- `ta-p17-004-phase17-gate-prep-2026-03-04.md`
- `two-node-one-click-checklist-2026-03-04.md`（含 nohup 与 systemd 两套命令清单）
