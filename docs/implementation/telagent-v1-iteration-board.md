# TelAgent v1 迭代看板（按周排期）

- 文档版本：v1.0
- 基线计划起始日：2026-03-02（周一）
- 基线计划结束日：2026-05-17（周日）
- 适用范围：Phase 0 -> Phase 11（发布后改进 + 联邦灰度兼容 + 自动化回滚 + v1.1 增强）

## 1. 看板目的

本看板把 `WBS`（任务拆解）转成周度可执行排期，便于按周推进、按阶段 Gate 验收，并能清晰看到 owner 建议与依赖关系。

## 2. Owner 建议（角色分配）

> 当前先按“角色 owner”排期；若后续补充真实成员名，只需在角色后追加姓名。

| 角色代号 | 角色 | 核心职责 | 建议投入 |
| --- | --- | --- | --- |
| PO | Protocol Owner | 规范冻结、类型治理、评审签字 | 30% |
| CE | Chain Engineer | 合约、部署、回滚、链路排障 | 100%（Phase 1 高峰） |
| BE-1 | Backend Engineer (Core) | API、链适配、索引器 | 100% |
| BE-2 | Backend Engineer (Messaging) | 消息、附件、联邦 | 100%（Phase 4 高峰） |
| SE | Security Engineer | 鉴权、DomainProof、联邦安全 | 40% |
| QA | QA Engineer | 契约/集成/E2E/回归 | 70%（后半程高峰） |
| SRE | SRE/DevOps | 监控、压测、发布准备 | 40%（Phase 4/5 高峰） |
| FE | Frontend Engineer | Web 管理台闭环 | 60%（Phase 5 高峰） |
| TL | Tech Lead/PM | Gate 主持、风险决策、上线审批 | 30% |

## 3. 周度迭代计划（11 周 + 发布后改进窗口）

## Week 1（2026-03-02 ~ 2026-03-08）- Phase 0

- 目标：完成规范冻结与 Phase 0 Gate。
- 计划任务：`TA-P0-001` ~ `TA-P0-008`
- 建议 Owner：`PO/SE/BE-1/QA/TL`
- 周交付：
  - 设计文档冻结版本
  - 错误码与状态机 RFC
  - 测试策略与 Gate 模板
- 周末 Gate：Phase 0 通过后进入 Week 2。

## Week 2（2026-03-09 ~ 2026-03-15）- Phase 1A

- 目标：完成合约核心实现与权限约束。
- 计划任务：`TA-P1-001` `TA-P1-002` `TA-P1-003` `TA-P1-004`
- 建议 Owner：`CE(主)` + `SE(审)` + `TL(评审)`
- 启动模板：`docs/implementation/phase-1/ta-p1-001-contract-interface-review-template.md`
- 启动记录：`docs/implementation/phase-1/ta-p1-001-contract-interface-review-2026-03-02.md`（结论：PASS）
- 当前进展（已完成）：`docs/implementation/phase-1/ta-p1-002-implementation-checkpoint-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-1/ta-p1-003-permission-constraint-checkpoint-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-1/ta-p1-004-event-model-checkpoint-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-1/ta-p1-005-positive-test-report-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-1/ta-p1-006-negative-test-report-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-1/ta-p1-007-deploy-script-checkpoint-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-1/ta-p1-008-rollback-runbook-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-1/ta-p1-009-abi-address-manifest-2026-03-02.md`
- 周交付：
  - `TelagentGroupRegistry` 核心逻辑
  - 权限与事件模型定稿

## Week 3（2026-03-16 ~ 2026-03-22）- Phase 1B

- 目标：完成合约测试、部署与回滚演练。
- 计划任务：`TA-P1-005` `TA-P1-006` `TA-P1-007` `TA-P1-008` `TA-P1-009` `TA-P1-010` `TA-P1-011`
- 建议 Owner：`CE(主)` + `QA(测)` + `TL(Gate)`
- 周交付：
  - 合约测试报告
  - 测试网部署地址与 ABI
  - 回滚 Runbook 与演练记录
- 周末 Gate：Phase 1 通过后进入 Week 4。

## Week 4（2026-03-23 ~ 2026-03-29）- Phase 2A

- 目标：完成 API 框架、响应/错误模型、身份与 gas 预检。
- 计划任务：`TA-P2-001` `TA-P2-002` `TA-P2-003` `TA-P2-004` `TA-P2-005`
- 建议 Owner：`BE-1(主)` + `SE(鉴权审查)` + `QA(契约草测)`
- 当前进展（已完成）：`docs/implementation/phase-2/ta-p2-001-api-server-route-mount-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-2/ta-p2-002-response-envelope-checkpoint-2026-03-02.md`
- 当前进展（已完成）：`docs/implementation/phase-2/ta-p2-003-rfc7807-error-pipeline-2026-03-02.md`
- 周交付：
  - `/api/v1/*` 全量路由骨架
  - RFC7807 统一错误链路
  - gas 余额不足标准错误打通

## Week 5（2026-03-30 ~ 2026-04-05）- Phase 2B

- 目标：完成群组 API 与集成测试并关闭 Phase 2。
- 计划任务：`TA-P2-006` `TA-P2-007` `TA-P2-008` `TA-P2-009` `TA-P2-010` `TA-P2-011`
- 建议 Owner：`BE-1(主)` + `BE-2(消息骨架)` + `QA(主测)` + `TL(Gate)`
- 周交付：
  - groups/identities/messages/attachments/federation API 可用
  - API 契约测试与基础集成测试报告
- 周末 Gate：Phase 2 通过后进入 Week 6。

## Week 6（2026-04-06 ~ 2026-04-12）- Phase 3A

- 目标：完成索引模型与 finality 主流程。
- 计划任务：`TA-P3-001` `TA-P3-002` `TA-P3-003` `TA-P3-004`
- 建议 Owner：`BE-1(主)` + `QA(联调)`
- 周交付：
  - 事件入库和双视图查询
  - finalityDepth 生效

## Week 7（2026-04-13 ~ 2026-04-19）- Phase 3B

- 目标：完成 reorg 回滚重放与一致性巡检并关闭 Phase 3。
- 计划任务：`TA-P3-005` `TA-P3-006` `TA-P3-007` `TA-P3-008`
- 建议 Owner：`BE-1(主)` + `QA(注入测试)` + `TL(Gate)`
- 周交付：
  - reorg 演练报告
  - 一致性巡检脚本与结果
- 周末 Gate：Phase 3 通过后进入 Week 8。

## Week 8（2026-04-20 ~ 2026-04-26）- Phase 4A

- 目标：完成消息投递基础能力（序号、去重、TTL）。
- 计划任务：`TA-P4-001` `TA-P4-002` `TA-P4-003` `TA-P4-004`
- 建议 Owner：`BE-2(主)` + `PO(协议冻结)` + `QA`
- 周交付：
  - Envelope 单调序 + 幂等去重
  - 离线邮箱 TTL 清理

## Week 9（2026-04-27 ~ 2026-05-03）- Phase 4B

- 目标：完成 provisional、附件、联邦安全硬化。
- 计划任务：`TA-P4-005` `TA-P4-006` `TA-P4-007` `TA-P4-008`
- 建议 Owner：`BE-2(主)` + `SE(联邦安全)` + `BE-1(群状态联动)`
- 周交付：
  - 未确权消息剔除机制
  - 附件清单校验
  - 联邦限流/鉴权/域名一致性

## Week 10（2026-05-04 ~ 2026-05-10）- Phase 4C

- 目标：完成 E2E 闭环与性能验证，关闭 Phase 4。
- 计划任务：`TA-P4-009` `TA-P4-010` `TA-P4-011` `TA-P4-012`
- 建议 Owner：`QA(主)` + `SRE(压测)` + `BE-2(修复)` + `TL(Gate)`
- 周交付：
  - 主链路 E2E 报告（建群->邀请->接受->聊天）
  - 离线 24h 拉取与排序报告
  - <=500 成员压测报告
- 周末 Gate：Phase 4 通过后进入 Week 11。

## Week 11（2026-05-11 ~ 2026-05-17）- Phase 5

- 目标：完成 MVP 最终验收与发布决策。
- 计划任务：`TA-P5-001` `TA-P5-002` `TA-P5-003` `TA-P5-004` `TA-P5-005` `TA-P5-006`
- 建议 Owner：`FE(主)` + `SRE` + `QA` + `SE` + `TL`
- 周交付：
  - Web 管理台闭环演示
  - 监控/告警上线
  - 故障注入与安全检查结果
  - Readiness 报告与 Go/No-Go 结论
- 周末 Gate：MVP 验收签字，版本冻结。

## 4. 当前可执行看板（即刻启动）

## 4.1 Ready This Week（2026-03-03 更新）

- 已完成：`TA-P4-001`（Signal/MLS 适配层接口冻结）
- 已完成：`TA-P4-002`（Envelope 序号生成与单调保障）
- 已完成：`TA-P4-003`（Envelope 去重与幂等写入）
- 已完成：`TA-P4-004`（离线邮箱 TTL 清理任务）
- 已完成：`TA-P4-005`（provisional 消息标记/剔除逻辑）
- 已完成：`TA-P4-006`（附件清单校验与会话幂等）
- 已完成：`TA-P4-007`（联邦接口鉴权/限流/重试）
- 已完成：`TA-P4-008`（node-info 域名一致性校验）
- 已完成：`TA-P4-009`（E2E 主链路：建群->邀请->接受->文本/图片/文件）
- 已完成：`TA-P4-010`（E2E 离线 24h 拉取 + 去重排序）
- 已完成：`TA-P4-011`（<=500 成员群压测与 SLO 验证）
- 已完成：`TA-P4-012`（Phase 4 Gate 评审与阶段关闭）
- 已完成：`TA-P5-001`（Web 管理台建群/邀请/接受/聊天闭环）
- 已完成：`TA-P5-002`（监控面板与告警规则落地）
- 已完成：`TA-P5-003`（链拥堵/reorg/联邦故障注入演练）
- 已完成：`TA-P5-004`（安全评审与上线检查清单）
- 已完成：`TA-P5-005`（Readiness 报告与 Go/No-Go 决策）
- 已完成：`TA-P5-006`（MVP 验收签字与版本冻结）
- 已完成：`TA-RLS-001`（发布前置检查，READY_FOR_TAG）
- 已完成：`TA-RLS-002`（`v0.1.0` tag 已创建并推送）
- 已完成：`TA-P6-001`（离线邮箱持久化，重启丢消息风险已修复）
- 已完成：`TA-P6-002`（多实例共享 mailbox state 方案设计）
- 已完成：`TA-P6-003`（store adapter + Postgres backend 实现）
- 已完成：`TA-P6-004`（发布后稳定性回归与 Gate 收口）
- 已完成：`TA-P7-001`（Phase 7 边界与验收标准冻结）
- 已完成：`TA-P7-002`（Postgres 多实例并发一致性校验）
- 已完成：`TA-P7-003`（Postgres 故障演练：重启恢复）
- 已完成：`TA-P7-004`（Phase 7 Gate 评审与阶段关闭）
- 已完成：`TA-P8-001`（Phase 8 边界与验收标准冻结）
- 已完成：`TA-P8-002`（联邦 group-state 版本防回退与 split-brain 检测）
- 已完成：`TA-P8-003`（跨 AZ 延迟/脑裂模拟脚本与机读清单）
- 已完成：`TA-P8-004`（Phase 8 Gate 评审与阶段关闭）
- 已完成：`TA-P9-001`（Phase 9 边界与验收标准冻结）
- 已完成：`TA-P9-002`（联邦协议版本兼容矩阵与拒绝策略落地）
- 已完成：`TA-P9-003`（联邦协议灰度兼容脚本与机读清单）
- 已完成：`TA-P9-004`（Phase 9 Gate 评审与阶段关闭）
- 已完成：`TA-P10-001`（Phase 10 边界与验收标准冻结）
- 已完成：`TA-P10-002`（联邦灰度发布自动化编排脚本与机读清单）
- 已完成：`TA-P10-003`（联邦应急回滚演练脚本与机读清单）
- 已完成：`TA-P10-004`（Phase 10 Gate 评审与阶段关闭）
- 已完成：`TA-P11-001`（Phase 11 边界与验收标准冻结）
- 已完成：`TA-P11-002`（Node Runtime/CI 基线固化）
- 已完成：`TA-P11-003`（DomainProof 自动挑战与过期轮转）
- 已完成：`TA-P11-004`（联邦互信 pinning 与轮换策略）
- 下一批 Ready：继续 Phase 11 执行（优先 `TA-P11-005` ~ `TA-P11-006`）

## 4.2 Blockers（2026-03-03 更新）

- 当前无硬阻塞项。
- 已知环境注意：首次运行 Node 索引器测试前需确保 `better-sqlite3` 本地绑定可用（若缺失可执行 `pnpm run build-release` 于 `node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3`）。

## 4.3 Definition of Done（每个任务统一标准）

1. 任务对应产出物已提交（代码/文档/脚本/报告）。
2. 验收标准有证据（测试结果或评审记录）。
3. 依赖任务状态已满足（不跳依赖）。
4. WBS 状态更新为 `DONE` 并附证据链接。

## 4.4 Day 1 快照（2026-03-02）

- `TA-P0-001` ~ `TA-P0-008`：WBS 状态已更新为 `DONE`。
- 证据索引：`docs/implementation/phase-0/README.md`。
- Gate 结论：`PASS`（Phase 0 补丁项已关闭，可按 Week 2 节奏进入 Phase 1）。

## 4.5 Week 1 收口执行（2026-03-03 ~ 2026-03-08）

- 执行排程：`docs/implementation/phase-0/week1-closeout-execution-plan.md`
- 当日快照：`docs/implementation/phase-0/week1-progress-2026-03-02.md`
- 核心目标：关闭 `P0-PATCH-001` 与 `P0-PATCH-002`
- Gate 节点：`2026-03-08 18:00 (UTC+8)` 复核结论

## 4.6 Phase 1 收口快照（2026-03-02）

- `TA-P1-007`：DONE（testnet 部署成功，已生成 `2026-03-02-testnet-deploy-manifest.json`）。
- `TA-P1-008`：DONE（testnet 升级回滚演练成功，`rollbackSucceeded=true`）。
- `TA-P1-009`：DONE（ABI + local/testnet 统一地址清单已归档）。
- `TA-P1-010`：DONE（ClawRouter 模块注册脚本 + 幂等校验通过，见 `docs/implementation/phase-1/ta-p1-010-router-module-registration-2026-03-03.md`）。
- `TA-P1-011`：DONE（`docs/implementation/gates/phase-1-gate.md` 结论 `PASS`）。
- 阶段结论：Phase 1 已正式关闭，可进入 Phase 2。

## 4.7 Phase 2 收口快照（2026-03-02）

- `TA-P2-001` ~ `TA-P2-010`：DONE（代码、契约测试、真实链集成证据已归档）。
- `TA-P2-009`：`@telagent/node` 合同测试 `9/9` 通过（`docs/implementation/phase-2/logs/2026-03-02-p2-node-test.txt`）。
- `TA-P2-010`：真实测试链闭环通过（`create/invite/accept/remove` 四段 tx hash 已归档到 manifest）。
- `TA-P2-011`：DONE（`docs/implementation/gates/phase-2-gate.md` 结论 `PASS`）。
- 阶段结论：Phase 2 已正式关闭，允许进入 Phase 3。

## 4.8 Phase 3 收口快照（2026-03-02）

- `TA-P3-001` ~ `TA-P3-007`：DONE（Indexer、finality、reorg、一致性巡检能力已归档）。
- `TA-P3-006`：reorg 注入测试通过（见 `docs/implementation/phase-3/logs/2026-03-02-p3-node-test.txt`）。
- `TA-P3-007`：链上 vs 读模型巡检 `mismatchCount=0`（见 `docs/implementation/phase-3/manifests/2026-03-02-p3-consistency-check.json`）。
- `TA-P3-008`：DONE（`docs/implementation/gates/phase-3-gate.md` 结论 `PASS`）。
- 阶段结论：Phase 3 已正式关闭，允许进入 Phase 4。

## 4.9 Phase 4A 进展快照（2026-03-03）

- `TA-P4-001`：DONE（见 `docs/implementation/phase-4/ta-p4-001-signal-mls-adapter-interface-freeze-2026-03-03.md`）。
- `TA-P4-002`：DONE（新增 `SequenceAllocator`，见 `docs/implementation/phase-4/ta-p4-002-seq-allocator-monotonic-2026-03-03.md`）。
- `TA-P4-003`：DONE（`envelopeId` 幂等去重，见 `docs/implementation/phase-4/ta-p4-003-envelope-dedupe-idempotent-write-2026-03-03.md`）。
- `TA-P4-004`：DONE（TTL 清理任务与定时清理，见 `docs/implementation/phase-4/ta-p4-004-mailbox-ttl-cleanup-task-2026-03-03.md`）。
- `TA-P4-005`：DONE（reorg 后 provisional 剔除，见 `docs/implementation/phase-4/ta-p4-005-provisional-mark-retract-2026-03-03.md`）。
- `TA-P4-006`：DONE（附件校验收口，见 `docs/implementation/phase-4/ta-p4-006-attachment-manifest-validation-2026-03-03.md`）。
- `TA-P4-007`：DONE（联邦鉴权/限流/重试，见 `docs/implementation/phase-4/ta-p4-007-federation-auth-rate-limit-retry-2026-03-03.md`）。
- `TA-P4-008`：DONE（域名一致性校验，见 `docs/implementation/phase-4/ta-p4-008-node-info-domain-consistency-2026-03-03.md`）。
- `TA-P4-009`：DONE（主链路 E2E，见 `docs/implementation/phase-4/ta-p4-009-e2e-main-path-2026-03-03.md`）。
- `TA-P4-010`：DONE（离线 24h E2E，见 `docs/implementation/phase-4/ta-p4-010-e2e-offline-24h-dedupe-order-2026-03-03.md`）。
- `TA-P4-011`：DONE（压测通过，见 `docs/implementation/phase-4/ta-p4-011-load-test-500-members-2026-03-03.md`）。
- `TA-P4-012`：DONE（Gate 评审通过，见 `docs/implementation/phase-4/ta-p4-012-phase4-gate-review-2026-03-03.md`）。
- 测试结果：`@telagent/node` `28/28` 通过（日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`），压测 `evaluation.passed=true`。
- 阶段状态：Phase 4 已关闭（Gate=PASS），允许进入 Phase 5。

## 4.10 Phase 5 启动快照（2026-03-03）

- `TA-P5-001`：DONE（Web 管理台闭环已打通，见 `docs/implementation/phase-5/ta-p5-001-web-console-flow-2026-03-03.md`）。
- `TA-P5-002`：DONE（监控指标/告警规则/面板已落地，见 `docs/implementation/phase-5/ta-p5-002-monitoring-dashboard-alerts-2026-03-03.md`）。
- `TA-P5-003`：DONE（故障注入 3/3 通过，见 `docs/implementation/phase-5/ta-p5-003-fault-injection-drill-2026-03-03.md`）。
- `TA-P5-004`：DONE（安全检查 10/10 通过，高危风险清零，见 `docs/implementation/phase-5/ta-p5-004-security-review-checklist-2026-03-03.md`）。
- `TA-P5-005`：DONE（发布 Readiness 报告结论为 GO，见 `docs/implementation/phase-5/ta-p5-005-readiness-report-2026-03-03.md`）。
- `TA-P5-006`：DONE（MVP 验收签字与版本冻结，Gate=PASS，见 `docs/implementation/phase-5/ta-p5-006-mvp-signoff-version-freeze-2026-03-03.md`）。
- `TA-RLS-001`：DONE（发布前置检查 6/6 通过，Preflight=READY_FOR_TAG，见 `docs/implementation/release/ta-rls-001-release-preflight-2026-03-03.md`）。
- `TA-RLS-002`：DONE（`v0.1.0` 标签与 Release Note 已归档，见 `docs/implementation/release/ta-rls-002-v0.1.0-tag-and-release-note-2026-03-03.md`）。
- `TA-P6-001`：DONE（离线邮箱持久化 + 重启恢复校验通过，见 `docs/implementation/phase-6/ta-p6-001-mailbox-persistence-2026-03-03.md`）。
- `TA-P6-002`：DONE（多实例共享状态 ADR 已冻结，见 `docs/implementation/phase-6/ta-p6-002-mailbox-multi-instance-adr-2026-03-03.md`）。
- `TA-P6-003`：DONE（store adapter + Postgres backend 已实现，见 `docs/implementation/phase-6/ta-p6-003-mailbox-store-adapter-postgres-2026-03-03.md`）。
- `TA-P6-004`：DONE（Phase 6 Gate=PASS，见 `docs/implementation/phase-6/ta-p6-004-phase6-gate-review-2026-03-03.md`）。
- 构建结果：`@telagent/web` build 通过（日志：`docs/implementation/phase-5/logs/2026-03-03-p5-web-build.txt`）。
- 回归结果：`@telagent/node` 与 workspace tests 通过（日志：`docs/implementation/phase-5/logs/2026-03-03-p5-node-test.txt`, `docs/implementation/phase-5/logs/2026-03-03-p5-workspace-test.txt`）。
- 阶段状态：Phase 5 已关闭（Gate=PASS），Phase 6 发布后改进已完成并关闭（Gate=PASS）。

## 4.11 Phase 6 发布后改进快照（2026-03-03）

- `TA-P6-001`：DONE（mailbox 从内存切换到 SQLite 持久化，重启后消息可恢复，见 `docs/implementation/phase-6/ta-p6-001-mailbox-persistence-2026-03-03.md`）。
- `TA-P6-002`：DONE（Postgres 首选 + SQLite fallback ADR 冻结，见 `docs/implementation/phase-6/ta-p6-002-mailbox-multi-instance-adr-2026-03-03.md`）。
- `TA-P6-003`：DONE（MailboxStore 适配层 + Postgres backend 代码落地，见 `docs/implementation/phase-6/ta-p6-003-mailbox-store-adapter-postgres-2026-03-03.md`）。
- `TA-P6-004`：DONE（发布后回归与 Gate 收口通过，见 `docs/implementation/phase-6/ta-p6-004-phase6-gate-review-2026-03-03.md`）。
- 验证脚本：`packages/node/scripts/run-phase6-mailbox-persistence-check.ts`（清单：`docs/implementation/phase-6/manifests/2026-03-03-p6-mailbox-persistence-check.json`）。
- 回归结果：`@telagent/node` `35/35` 通过（日志：`docs/implementation/phase-6/logs/2026-03-03-p6-node-test.txt`）。
- 下一批任务：Phase 7 / Phase 8 / Phase 9 / Phase 10 已关闭（见 `docs/implementation/phase-7/README.md`、`docs/implementation/phase-8/README.md`、`docs/implementation/phase-9/README.md`、`docs/implementation/phase-10/README.md`），进入 Phase 11 执行。

## 4.12 Phase 7 Postgres 集群压测与故障演练快照（2026-03-03）

- `TA-P7-001`：DONE（边界与验收冻结，见 `docs/implementation/phase-7/ta-p7-001-phase7-boundary-acceptance-2026-03-03.md`）。
- `TA-P7-002`：DONE（多实例并发一致性通过，见 `docs/implementation/phase-7/ta-p7-002-postgres-multi-instance-check-2026-03-03.md`）。
- `TA-P7-003`：DONE（Postgres 重启故障演练通过，见 `docs/implementation/phase-7/ta-p7-003-postgres-fault-drill-2026-03-03.md`）。
- `TA-P7-004`：DONE（Gate=PASS，见 `docs/implementation/phase-7/ta-p7-004-phase7-gate-review-2026-03-03.md`）。
- 验证结果：多实例校验 `decision=PASS`，故障演练 `decision=PASS`（见 `docs/implementation/phase-7/manifests/`）。
- 阶段状态：Phase 7 已关闭（Gate=PASS），并已由 Phase 8 风险收口补齐。

## 4.13 Phase 8 联邦韧性与可观测增强快照（2026-03-03）

- `TA-P8-001`：DONE（边界与验收冻结，见 `docs/implementation/phase-8/ta-p8-001-phase8-boundary-acceptance-2026-03-03.md`）。
- `TA-P8-002`：DONE（stateVersion 防回退与 split-brain 检测落地，见 `docs/implementation/phase-8/ta-p8-002-federation-state-version-guard-2026-03-03.md`）。
- `TA-P8-003`：DONE（联邦韧性脚本校验通过，见 `docs/implementation/phase-8/ta-p8-003-federation-resilience-check-2026-03-03.md`）。
- `TA-P8-004`：DONE（Gate=PASS，见 `docs/implementation/phase-8/ta-p8-004-phase8-gate-review-2026-03-03.md`）。
- 验证结果：韧性脚本 `scenarios=4/4, decision=PASS`（见 `docs/implementation/phase-8/manifests/2026-03-03-p8-federation-resilience-check.json`）。
- 阶段状态：Phase 8 已关闭（Gate=PASS），并已由 Phase 9 灰度兼容能力补齐后续风险。

## 4.14 Phase 9 联邦跨域运行手册与灰度兼容快照（2026-03-03）

- `TA-P9-001`：DONE（边界与验收冻结，见 `docs/implementation/phase-9/ta-p9-001-phase9-boundary-acceptance-2026-03-03.md`）。
- `TA-P9-002`：DONE（协议兼容矩阵与拒绝策略落地，见 `docs/implementation/phase-9/ta-p9-002-federation-protocol-compatibility-2026-03-03.md`）。
- `TA-P9-003`：DONE（协议灰度兼容脚本校验通过，见 `docs/implementation/phase-9/ta-p9-003-federation-protocol-compat-check-2026-03-03.md`）。
- `TA-P9-004`：DONE（Gate=PASS，见 `docs/implementation/phase-9/ta-p9-004-phase9-gate-review-2026-03-03.md`）。
- 验证结果：协议兼容脚本 `scenarios=4/4, decision=PASS`（见 `docs/implementation/phase-9/manifests/2026-03-03-p9-federation-protocol-compat-check.json`）。
- 阶段状态：Phase 9 已关闭（Gate=PASS），Phase 10 已完成并关闭。

## 4.15 Phase 10 联邦灰度发布自动化与应急回滚编排快照（2026-03-03）

- `TA-P10-001`：DONE（边界与验收冻结，见 `docs/implementation/phase-10/ta-p10-001-phase10-boundary-acceptance-2026-03-03.md`）。
- `TA-P10-002`：DONE（灰度发布自动化脚本与机读清单落地，见 `docs/implementation/phase-10/ta-p10-002-federation-rollout-automation-2026-03-03.md`）。
- `TA-P10-003`：DONE（应急回滚演练脚本与机读清单落地，见 `docs/implementation/phase-10/ta-p10-003-federation-rollback-drill-2026-03-03.md`）。
- `TA-P10-004`：DONE（Gate=PASS，见 `docs/implementation/phase-10/ta-p10-004-phase10-gate-review-2026-03-03.md`）。
- 验证结果：灰度脚本 `stages=3, nodes=8/8, decision=PASS`；回滚演练 `decision=PASS`（见 `docs/implementation/phase-10/manifests/`）。
- 阶段状态：Phase 10 已关闭（Gate=PASS），Phase 9 遗留风险已完成收口。

## 4.16 Phase 11 v1.1 安全与运营能力增强启动快照（2026-03-03）

- `TA-P11-001`：DONE（边界与验收冻结，见 `docs/implementation/phase-11/ta-p11-001-phase11-boundary-acceptance-2026-03-03.md`）。
- `TA-P11-002`：DONE（Node Runtime/CI 基线固化，见 `docs/implementation/phase-11/ta-p11-002-runtime-ci-baseline-2026-03-03.md`）。
- `TA-P11-003`：DONE（DomainProof 自动挑战与过期轮转，见 `docs/implementation/phase-11/ta-p11-003-domain-proof-auto-challenge-rotation-2026-03-03.md`）。
- `TA-P11-004`：DONE（联邦互信 pinning 与轮换，见 `docs/implementation/phase-11/ta-p11-004-federation-pinning-rotation-2026-03-03.md`）。
- `TA-P11-005`：TODO（联邦 DLQ 与重放工具链）。
- `TA-P11-006`：TODO（Signal/MLS 密钥生命周期管理）。
- `TA-P11-007`：TODO（revoked DID 会话失效链路）。
- `TA-P11-008`：TODO（Agent SDK TypeScript v0）。
- `TA-P11-009`：TODO（Web Console v2 运营能力增强）。
- `TA-P11-010`：TODO（Phase 11 Gate 收口）。
- 阶段状态：Phase 11 已启动，进入执行阶段。

## 5. 周会与 Gate 节奏建议

- 每周一：Iteration Planning（30 分钟）
- 每周三：风险同步（15 分钟）
- 每周五：Demo + 测试回归（30 分钟）
- 每阶段末（周日或下周一）：Phase Gate Review

## 6. 追踪方式建议

- 每个任务 ID 对应一个 issue/卡片（标题带任务 ID）。
- PR 标题包含任务 ID，例如：`[TA-P2-006] Implement group service chain flow`。
- Gate 结论固定归档到：`docs/implementation/gates/phase-x-gate.md`。
