# TelAgent v1 Phase 17 Gate（Draft）

- Phase：`Phase 17（跨节点自动投递闭环加固）`
- Gate 编号：`TA-GATE-P17`
- 计划评审日期：`TBD（待 TA-P17-003 完成后确认）`
- 最近更新：`2026-03-04`
- 主持人（TL）：`TBD`
- 参与人：`Backend/SRE/QA/TL`
- 结论：`DRAFT（待评审）`

## 1) 输入物检查（草案）

- [ ] WBS 中 `TA-P17-001` ~ `TA-P17-004` 状态与证据已同步
- [ ] Phase 17 执行文档与运行日志已归档到 `docs/implementation/phase-17/`
- [ ] 双节点联调报告 `cross-node-chat-check-report.json` 已归档
- [ ] `pnpm --filter @telagent/node test` 回归结果已附证据

## 2) Exit Criteria 核对（草案）

| 条目 | 目标结果 | 证据路径 | 当前状态 | 备注 |
| --- | --- | --- | --- | --- |
| sequencer 归属策略与远端提交链路完成（`TA-P17-001`） | PASS | `packages/node/src/services/sequencer-domain.ts`, `packages/node/src/api/routes/messages.ts`, `packages/node/src/api/routes/federation.ts` | READY | `group -> groupDomain`, `direct -> min(selfDomain,targetDomain)` |
| 持久化 outbox 与重放策略完成（`TA-P17-002`） | PASS | `packages/node/src/services/federation-delivery-service.ts`, `packages/node/src/storage/message-repository.ts`, `packages/node/src/storage/postgres-message-repository.ts` | READY | 覆盖 SQLite/Postgres |
| 双节点实机联调完成（`TA-P17-003`） | PASS | `docs/implementation/phase-17/cross-node-chat-check-report.json` | BLOCKED | 待执行脚本并生成报告 |
| Phase 17 Gate 收口完成（`TA-P17-004`） | PASS | `docs/implementation/gates/phase-17-gate.md` | IN_PROGRESS | 当前为草案 |
| 回归测试通过 | PASS | `pnpm --filter @telagent/node test` | READY | 预期 0 fail |

## 3) 风险与阻塞（草案）

| 风险/阻塞 | 影响 | Owner | 截止日期 | 状态 |
| --- | --- | --- | --- | --- |
| 双云节点尚未提供统一联调窗口与运行参数 | Gate 无法出正式 PASS 结论 | SRE + TL | TBD | OPEN |
| 跨节点联调依赖公网联邦路由与域名解析可达 | 可能出现假性失败（网络/证书） | SRE | TBD | OPEN |

## 4) 条件放行补丁项（仅 CONDITIONAL PASS 时填写）

| 补丁项 | Owner | 截止日期 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- |
| 待评审决定 | TBD | TBD | TBD | N/A |

## 5) 结论说明（草案）

- 当前判断：代码与单测层面已满足 Phase 17 主体能力。
- 未决条件：缺少 `TA-P17-003` 实机双节点报告。
- 下一步：执行 `pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts` 并归档报告，随后完成 Gate 最终结论。

## 6) 签字（待补）

- TL：`TBD`
- Phase Owner（Backend/SRE）：`TBD`
- QA：`TBD`
