# TelAgent v1 任务拆解（WBS）

- 文档版本：v1.0
- 最后更新：2026-03-03
- 目标：把实施计划落地为可执行、可跟踪、可验收的任务清单

## 1. 使用说明

- **执行顺序**：按 `Phase 0 -> Phase 16` 串行推进，禁止跨 Gate 跳阶段。
- **状态字段**：`TODO | IN_PROGRESS | BLOCKED | DONE`。
- **估算单位**：人日（PD）。
- **依赖格式**：`-` 表示无依赖；多个依赖用逗号分隔任务 ID。
- **验收标准**：必须是可验证结果（测试、文档、脚本、报告）。

## 2. 里程碑依赖图

```mermaid
flowchart LR
  P0["Phase 0\n规范冻结"] --> P1["Phase 1\n合约与部署"]
  P1 --> P2["Phase 2\nNode API 与链适配"]
  P2 --> P3["Phase 3\nIndexer 与确定性视图"]
  P3 --> P4["Phase 4\n消息通道"]
  P4 --> P5["Phase 5\nMVP 验收"]
  P5 --> P6["Phase 6\n发布后改进"]
  P6 --> P7["Phase 7\nPostgres 压测与故障演练"]
  P7 --> P8["Phase 8\n联邦韧性与可观测增强"]
  P8 --> P9["Phase 9\n联邦灰度兼容矩阵"]
  P9 --> P10["Phase 10\n联邦灰度发布自动化与回滚编排"]
  P10 --> P11["Phase 11\nv1.1 安全与运营能力增强"]
  P11 --> P12["Phase 12\nv1.2 候选池冻结与执行排程"]
  P12 --> P13["Phase 13\nv0.2.0 稳定化与可运营增强"]
  P13 --> P14["Phase 14\n产品聚焦与缺陷收敛"]
  P14 --> P15["Phase 15\nWeb App 工业级设计与多平台建设"]
  P15 --> P16["Phase 16\nWeb App 实装冲刺"]
```

## 3. 分阶段任务清单

| ID | 阶段 | 任务 | 负责人角色 | 预估(PD) | 依赖 | 输出物 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TA-P0-001 | Phase 0 | 冻结 API 路径规则（仅 `/api/v1/*`） | Protocol Owner | 0.5 | - | API 规范章节 | 路径清单评审通过 | DONE |
| TA-P0-002 | Phase 0 | 冻结成功/错误 envelope 规范 | Protocol Owner | 0.5 | TA-P0-001 | 响应规范文档 | 示例请求通过契约测试 | DONE |
| TA-P0-003 | Phase 0 | 冻结错误码字典与 HTTP 映射 | Protocol Owner | 0.5 | TA-P0-002 | 错误码清单 | RFC7807 示例全覆盖 | DONE |
| TA-P0-004 | Phase 0 | 冻结 DID hash 与 controller 鉴权规则 | Security Engineer | 0.5 | - | 身份鉴权 RFC | 与 ClawNet 规则逐项对齐 | DONE |
| TA-P0-005 | Phase 0 | 输出群状态机 RFC（pending/finalized/reorg） | Backend Engineer | 1 | TA-P0-004 | 状态机文档 | 状态转移图评审通过 | DONE |
| TA-P0-006 | Phase 0 | 输出 DomainProofV1 规范 | Security Engineer | 1 | TA-P0-005 | 域名验证规范 | 覆盖字段、校验、过期策略 | DONE |
| TA-P0-007 | Phase 0 | 冻结测试策略（合约/API/集成/E2E） | QA Engineer | 1 | TA-P0-003, TA-P0-005 | 测试策略文档 | 阶段 Gate 可执行 | DONE |
| TA-P0-008 | Phase 0 | 建立阶段 Gate 模板与评审机制 | PM/Tech Lead | 0.5 | TA-P0-007 | Gate 模板 | 每阶段有明确通过条件 | DONE |

| TA-P1-001 | Phase 1 | 合约接口审查与签字 | Chain Engineer | 0.5 | TA-P0-004, TA-P0-005 | 接口审查记录 | 函数签名冻结 | DONE |
| TA-P1-002 | Phase 1 | 实现 `TelagentGroupRegistry` 核心存储/校验 | Chain Engineer | 2 | TA-P1-001 | 合约代码 | 核心流程可编译部署 | DONE |
| TA-P1-003 | Phase 1 | 实现权限约束（active/controller/owner） | Chain Engineer | 1 | TA-P1-002 | 合约逻辑补齐 | 非法调用全部回退 | DONE |
| TA-P1-004 | Phase 1 | 实现事件模型（可重建成员集） | Chain Engineer | 1 | TA-P1-002 | 事件定义 | 事件字段满足重建需求 | DONE |
| TA-P1-005 | Phase 1 | 编写合约单元测试：正向流程 | QA + Chain Engineer | 1.5 | TA-P1-003, TA-P1-004 | 合约测试用例 | create/invite/accept/remove 全绿 | DONE |
| TA-P1-006 | Phase 1 | 编写合约单元测试：异常流程 | QA + Chain Engineer | 1.5 | TA-P1-003 | 合约测试用例 | 非 controller / revoked / 重复操作全绿 | DONE |
| TA-P1-007 | Phase 1 | 编写部署脚本（local/testnet） | Chain Engineer | 1 | TA-P1-002 | deploy script | 可重复部署且输出地址 | DONE |
| TA-P1-008 | Phase 1 | 编写回滚脚本与 Runbook | Chain Engineer | 1 | TA-P1-007 | rollback script + runbook | 在测试网完成回滚演练 | DONE |
| TA-P1-009 | Phase 1 | 产出 ABI 与地址清单 | Chain Engineer | 0.5 | TA-P1-007 | ABI/manifest | 下游可直接集成调用 | DONE |
| TA-P1-010 | Phase 1 | （可选）注册 ClawRouter 模块 | Chain Engineer | 0.5 | TA-P1-009 | router 注册脚本 | 模块查询可见 | DONE |
| TA-P1-011 | Phase 1 | 合约阶段 Gate 评审 | PM/Tech Lead | 0.5 | TA-P1-005, TA-P1-006, TA-P1-008 | Gate 结论 | Phase 1 正式关闭 | DONE |

| TA-P2-001 | Phase 2 | 搭建 API Server 与路由挂载 | Backend Engineer | 1 | TA-P0-001 | API 框架代码 | 所有核心路由在 `/api/v1/*` | DONE |
| TA-P2-002 | Phase 2 | 实现响应封装（单资源/列表/Location） | Backend Engineer | 1 | TA-P0-002, TA-P2-001 | response 模块 | 契约测试通过 | DONE |
| TA-P2-003 | Phase 2 | 实现 RFC7807 错误处理链路 | Backend Engineer | 1 | TA-P0-003, TA-P2-001 | error/handler 模块 | 错误响应字段完整 | DONE |
| TA-P2-004 | Phase 2 | 实现 IdentityAdapterService | Backend Engineer | 1 | TA-P0-004, TA-P1-009 | 身份适配服务 | active/controller 校验可用 | DONE |
| TA-P2-005 | Phase 2 | 实现 GasService 与余额预检 | Backend Engineer | 1 | TA-P2-004 | gas 预检服务 | 余额不足返回标准错误 | DONE |
| TA-P2-006 | Phase 2 | 实现 GroupService 链上写流程 | Backend Engineer | 2 | TA-P2-004, TA-P2-005 | group service | create/invite/accept/remove 可执行 | DONE |
| TA-P2-007 | Phase 2 | 实现 `identities*` 与 `groups*` API | Backend Engineer | 1.5 | TA-P2-006 | route handlers | 所有必选接口可访问 | DONE |
| TA-P2-008 | Phase 2 | 实现 messages/attachments/federation API 骨架 | Backend Engineer | 2 | TA-P2-002, TA-P2-003 | route handlers | 基础请求可收发 | DONE |
| TA-P2-009 | Phase 2 | API 契约测试（路径+envelope+错误） | QA Engineer | 1.5 | TA-P2-007, TA-P2-008 | API test suite | 契约测试全绿 | DONE |
| TA-P2-010 | Phase 2 | 集成测试（真实 ClawIdentity + 测试链） | QA + Backend | 2 | TA-P2-006, TA-P1-009 | integration tests | 建群到成员变更闭环通过 | DONE |
| TA-P2-011 | Phase 2 | Node API 阶段 Gate 评审 | PM/Tech Lead | 0.5 | TA-P2-009, TA-P2-010 | Gate 结论 | Phase 2 正式关闭 | DONE |

| TA-P3-001 | Phase 3 | 设计并创建索引存储表结构 | Backend Engineer | 1 | TA-P2-006 | DB schema | `groups/group_members/group_events` 就绪 | DONE |
| TA-P3-002 | Phase 3 | 实现 GroupIndexer 事件订阅与解码 | Backend Engineer | 2 | TA-P1-009, TA-P3-001 | indexer service | 事件可持续入库 | DONE |
| TA-P3-003 | Phase 3 | 实现 pending/finalized 双视图查询 | Backend Engineer | 1.5 | TA-P3-002 | 查询逻辑/API | 同一群可切换两种视图 | DONE |
| TA-P3-004 | Phase 3 | 实现 finalityDepth 处理逻辑 | Backend Engineer | 1 | TA-P3-002 | finality 逻辑 | 仅确认后写 finalized | DONE |
| TA-P3-005 | Phase 3 | 实现 reorg 检测与回滚重放 | Backend Engineer | 2 | TA-P3-004 | rollback/replay 逻辑 | 重组后状态可一致恢复 | DONE |
| TA-P3-006 | Phase 3 | 编写 reorg 注入测试 | QA Engineer | 1.5 | TA-P3-005 | reorg tests | 注入测试全绿 | DONE |
| TA-P3-007 | Phase 3 | 一致性巡检脚本（链上 vs 读模型） | Backend Engineer | 1 | TA-P3-003, TA-P3-005 | consistency checker | 巡检误差率为 0 | DONE |
| TA-P3-008 | Phase 3 | Indexer 阶段 Gate 评审 | PM/Tech Lead | 0.5 | TA-P3-006, TA-P3-007 | Gate 结论 | Phase 3 正式关闭 | DONE |

| TA-P4-001 | Phase 4 | Signal/MLS 适配层接口冻结 | Protocol Owner | 1 | TA-P0-005 | 协议接口文档 | 参数与状态机一致 | DONE |
| TA-P4-002 | Phase 4 | 实现 Envelope 序号生成与单调保障 | Backend Engineer | 1 | TA-P4-001 | seq allocator | 会话内 seq 单调递增 | DONE |
| TA-P4-003 | Phase 4 | 实现 Envelope 去重与幂等写入 | Backend Engineer | 1 | TA-P4-002 | dedupe store | 重复 envelope 不重复投递 | DONE |
| TA-P4-004 | Phase 4 | 实现离线邮箱 TTL 清理任务 | Backend Engineer | 1 | TA-P4-003 | mailbox cleaner | 超时消息按策略清理 | DONE |
| TA-P4-005 | Phase 4 | 实现 provisional 消息标记/剔除逻辑 | Backend Engineer | 1.5 | TA-P3-005, TA-P4-003 | provisional handler | 失败/reorg 后可剔除 | DONE |
| TA-P4-006 | Phase 4 | 实现附件 init/complete 与清单校验 | Backend Engineer | 1.5 | TA-P2-008 | attachment service | 50MB 限制与校验生效 | DONE |
| TA-P4-007 | Phase 4 | 实现联邦接口鉴权/限流/重试 | Security + Backend | 2 | TA-P2-008 | federation hardening | 恶意重放与洪泛可控 | DONE |
| TA-P4-008 | Phase 4 | 实现 node-info 域名一致性校验 | Security Engineer | 1 | TA-P0-006, TA-P4-007 | domain verify logic | 域名与节点声明一致 | DONE |
| TA-P4-009 | Phase 4 | E2E：A 建群 -> 邀请 B -> B 接受 -> 群聊 | QA Engineer | 2 | TA-P4-005, TA-P4-006 | E2E suite | 主链路全绿 | DONE |
| TA-P4-010 | Phase 4 | E2E：离线 24h 拉取 + 去重排序 | QA Engineer | 1.5 | TA-P4-004, TA-P4-009 | E2E suite | 离线场景稳定通过 | DONE |
| TA-P4-011 | Phase 4 | 压测（<=500 成员群） | SRE + QA | 2 | TA-P4-009 | 压测报告 | 核心 SLO 达到目标 | DONE |
| TA-P4-012 | Phase 4 | 消息通道阶段 Gate 评审 | PM/Tech Lead | 0.5 | TA-P4-010, TA-P4-011 | Gate 结论 | Phase 4 正式关闭 | DONE |

| TA-P5-001 | Phase 5 | Web 管理台打通建群/邀请/接受/聊天 | Frontend Engineer | 2 | TA-P4-009 | Web 功能闭环 | 全流程可操作可演示 | DONE |
| TA-P5-002 | Phase 5 | 监控面板与告警规则落地 | SRE/DevOps | 1.5 | TA-P4-011 | Dashboard + Alert | 指标/告警可用 | DONE |
| TA-P5-003 | Phase 5 | 故障注入演练（链拥堵/reorg/联邦故障） | QA + SRE | 1.5 | TA-P5-002 | 演练报告 | 演练项全部可恢复 | DONE |
| TA-P5-004 | Phase 5 | 安全评审与上线检查清单 | Security Engineer | 1 | TA-P5-003 | Security checklist | 高危风险清零 | DONE |
| TA-P5-005 | Phase 5 | 发布 Readiness 报告（Go/No-Go） | PM/Tech Lead | 1 | TA-P5-001, TA-P5-004 | readiness report | 审批通过可发布 | DONE |
| TA-P5-006 | Phase 5 | MVP 验收签字与版本冻结 | PM/Tech Lead | 0.5 | TA-P5-005 | 验收记录 | Phase 5 正式关闭 | DONE |
| TA-RLS-001 | Release | 发布前置检查（Tag 前校验） | Release Owner | 0.5 | TA-P5-006 | preflight report | 结论 READY_FOR_TAG | DONE |
| TA-RLS-002 | Release | 创建 `v0.1.0` 标签与发布说明 | Release Owner | 0.5 | TA-RLS-001 | tag + release note | 标签推送成功并归档证据 | DONE |
| TA-P6-001 | Phase 6 | 离线邮箱持久化（修复重启丢消息风险） | Backend Engineer | 1 | TA-RLS-002 | mailbox repository + checks | 重启后消息可读且序号连续 | DONE |
| TA-P6-002 | Phase 6 | 多实例共享 mailbox state 方案设计 | Backend Engineer + SRE | 1 | TA-P6-001 | ADR + rollout plan | 明确存储/锁/一致性策略 | DONE |
| TA-P6-003 | Phase 6 | mailbox store 外置化实现（SQLite->Postgres 可选） | Backend Engineer | 2 | TA-P6-002 | storage adapter | 多实例读写一致性验证通过 | DONE |
| TA-P6-004 | Phase 6 | 发布后稳定性回归与 Gate | QA + TL | 0.5 | TA-P6-003 | regression report + gate | Phase 6 风险收口关闭 | DONE |
| TA-P7-001 | Phase 7 | 冻结 Postgres 集群压测与故障演练边界/验收标准 | TL + BE + SRE | 0.5 | TA-P6-004 | Phase 7 boundary doc | 范围、验收、证据模板冻结 | DONE |
| TA-P7-002 | Phase 7 | 多实例并发一致性校验（共享 Postgres mailbox） | Backend Engineer + QA | 1.5 | TA-P7-001 | 多实例检查脚本+manifest | `duplicateSeqCount=0` 且 `missingSeqCount=0` | DONE |
| TA-P7-003 | Phase 7 | Postgres 故障演练（重启恢复） | SRE + Backend | 1 | TA-P7-002 | 故障演练脚本+manifest | `persistedAcrossRestart=true` 且 `sequenceContinuesAfterRestart=true` | DONE |
| TA-P7-004 | Phase 7 | Phase 7 Gate 评审与收口 | TL + QA | 0.5 | TA-P7-003 | gate 结论文档 | Phase 7 正式关闭 | DONE |
| TA-P8-001 | Phase 8 | 冻结联邦韧性增强范围与验收标准 | TL + BE + SRE + QA | 0.5 | TA-P7-004 | Phase 8 boundary doc | 风险映射、验收项、证据模板冻结 | DONE |
| TA-P8-002 | Phase 8 | 联邦 group-state 版本防回退与 split-brain 检测 | Backend Engineer | 1 | TA-P8-001 | federation service upgrade | stale/split-brain 冲突可拒绝且可观测 | DONE |
| TA-P8-003 | Phase 8 | 跨 AZ 延迟/脑裂模拟脚本与机读清单 | Backend Engineer + QA | 1 | TA-P8-002 | resilience check script + manifest | 4/4 场景 PASS 且计数正确 | DONE |
| TA-P8-004 | Phase 8 | Phase 8 Gate 评审与收口 | TL + QA | 0.5 | TA-P8-003 | gate 结论文档 | Phase 8 正式关闭 | DONE |
| TA-P9-001 | Phase 9 | 冻结联邦协议兼容矩阵边界与验收标准 | TL + BE + SRE + QA | 0.5 | TA-P8-004 | Phase 9 boundary doc | 兼容矩阵/拒绝策略/证据模板冻结 | DONE |
| TA-P9-002 | Phase 9 | 实现 federation 协议版本兼容矩阵与拒绝策略 | Backend Engineer | 1.5 | TA-P9-001 | federation compatibility guard | 兼容版本放行，不兼容版本 RFC7807 拒绝 | DONE |
| TA-P9-003 | Phase 9 | 灰度兼容脚本与机读清单（v1/v2/v3） | Backend Engineer + QA | 1 | TA-P9-002 | protocol check script + manifest | 4/4 场景 PASS，计数准确 | DONE |
| TA-P9-004 | Phase 9 | Phase 9 Gate 评审与收口 | TL + QA | 0.5 | TA-P9-003 | gate 结论文档 | Phase 9 正式关闭 | DONE |
| TA-P10-001 | Phase 10 | 冻结联邦灰度发布自动化与回滚演练边界/验收标准 | TL + BE + SRE + QA | 0.5 | TA-P9-004 | Phase 10 boundary doc | 范围、验收、证据模板冻结 | DONE |
| TA-P10-002 | Phase 10 | 联邦灰度发布自动化编排脚本与机读清单 | Backend Engineer + SRE | 1 | TA-P10-001 | rollout automation script + manifest | 节点覆盖完整且 `decision=PASS` | DONE |
| TA-P10-003 | Phase 10 | 联邦应急回滚演练脚本与机读清单 | Backend Engineer + QA | 1 | TA-P10-002 | rollback drill script + manifest | 演练结果 `decision=PASS` 且回滚步骤可复用 | DONE |
| TA-P10-004 | Phase 10 | Phase 10 Gate 评审与收口 | TL + QA | 0.5 | TA-P10-003 | gate 结论文档 | Phase 10 正式关闭 | DONE |
| TA-P11-001 | Phase 11 | 冻结 v1.1 安全与运营能力增强边界/验收标准 | TL + BE + SRE + QA + Security | 0.5 | TA-P10-004 | Phase 11 boundary doc | 范围、验收、证据模板冻结 | DONE |
| TA-P11-002 | Phase 11 | Node Runtime/CI 基线固化 | TL + DevEx | 1 | TA-P11-001 | runtime baseline + CI workflow | 基线版本锁定且 CI 稳定通过 | DONE |
| TA-P11-003 | Phase 11 | DomainProof 自动挑战与过期轮转 | Security + Backend | 2 | TA-P11-001 | domain challenge service + tests | 非法域名挑战失败，合法域名可续期 | DONE |
| TA-P11-004 | Phase 11 | 联邦互信 pinning 与轮换策略 | Security + Backend | 1.5 | TA-P11-001 | pinning policy + rotation runbook | 非法证书请求被拒绝且有审计证据 | DONE |
| TA-P11-005 | Phase 11 | 联邦 DLQ 与重放工具链 | Backend + SRE | 1.5 | TA-P11-001 | DLQ store + replay script | 失败消息可重放且顺序一致 | DONE |
| TA-P11-006 | Phase 11 | Signal/MLS 密钥生命周期管理 | Protocol + Backend | 2 | TA-P11-001 | key lifecycle manager + tests | 轮换/撤销/恢复流程可验证 | DONE |
| TA-P11-007 | Phase 11 | revoked DID 会话失效链路 | Security + Backend | 1.5 | TA-P11-001 | revocation invalidation flow | revoked DID 无法继续发送新消息 | DONE |
| TA-P11-008 | Phase 11 | Agent SDK（TypeScript）v0 | Backend + DX | 2 | TA-P11-001 | SDK package + examples | 30 分钟内可完成建群与发消息集成 | DONE |
| TA-P11-009 | Phase 11 | Web Console v2 运营能力增强 | Frontend + SRE | 2 | TA-P11-001 | web v2 console + e2e | 支持群状态/回滚入口/联邦视图 | DONE |
| TA-P11-010 | Phase 11 | Phase 11 Gate 评审与收口 | TL + QA | 0.5 | TA-P11-002, TA-P11-003, TA-P11-004, TA-P11-005, TA-P11-006, TA-P11-007, TA-P11-008, TA-P11-009 | gate 结论文档 | Phase 11 正式关闭 | DONE |
| TA-P12-001 | Phase 12 | 冻结 v1.2 候选池与优先级 | TL + BE + Security + SRE + QA | 0.5 | TA-P11-010 | candidate pool freeze doc + manifest | 候选池冻结并明确首个 MUST 任务 | DONE |
| TA-P12-002 | Phase 12 | 链上/链下审计快照导出（脱敏） | Backend + Security | 2 | TA-P12-001 | audit snapshot service + export api | 可导出审计摘要且不泄露明文 | DONE |
| TA-P12-003 | Phase 12 | revoked DID 实时会话隔离（订阅+驱逐） | Security + Backend | 1.5 | TA-P12-001 | revocation subscription + quarantine flow | 撤销事件后会话进入隔离且发送被拒绝 | DONE |
| TA-P12-004 | Phase 12 | 联邦 SLO 自动化（DLQ 自动重放 + burn-rate 告警） | SRE + Backend | 1.5 | TA-P12-001 | replay scheduler + alert policy | 自动重放与多级告警可验证 | DONE |
| TA-P12-005 | Phase 12 | Agent SDK Python Beta | DX + Backend | 2 | TA-P12-001 | python sdk + quickstart | 30 分钟内完成建群与发消息集成 | DONE |
| TA-P12-006 | Phase 12 | Web Console v2.1 运营与应急面板 | Frontend + SRE | 2 | TA-P12-001 | ops dashboard v2.1 | 审计快照、DLQ 批量重放、风险看板可用 | DONE |
| TA-P12-007 | Phase 12 | 多节点密钥轮换编排脚本 | Security + SRE | 1 | TA-P12-001 | key-rotation orchestrator + manifest | 分批轮换与回滚剧本可复现 | DONE |
| TA-P12-008 | Phase 12 | Phase 12 Gate 评审与收口 | TL + QA | 0.5 | TA-P12-002, TA-P12-003, TA-P12-004, TA-P12-005, TA-P12-006, TA-P12-007 | gate 结论文档 | Phase 12 正式关闭 | DONE |
| TA-P13-001 | Phase 13 | 冻结 v0.2.0 稳定化边界与验收标准 | TL + BE + SRE + Security + QA | 0.5 | TA-P12-008 | phase boundary doc + manifest | 边界、验收、证据模板冻结 | DONE |
| TA-P13-002 | Phase 13 | 规模压测升级（消息 + 会话） | Backend + SRE + QA | 1.5 | TA-P13-001 | scale load check script + manifest | 吞吐/时延达标且序号/去重语义不退化 | DONE |
| TA-P13-003 | Phase 13 | 灾备演练（备份/恢复/RTO-RPO） | SRE + Backend + QA | 1 | TA-P13-001 | DR drill script + manifest | `RTO<=2s`、`RPO=0`、恢复后序号连续 | DONE |
| TA-P13-004 | Phase 13 | 审计快照签名归档与验签 | Security + Backend | 1 | TA-P13-001 | audit archive script + manifest | digest/signature 一致且可离线验签 | DONE |
| TA-P13-005 | Phase 13 | 联邦重放保护增强（熔断 + 退避） | Backend + Security | 2 | TA-P13-001 | federation replay protection + tests + manifest | 重放失败具备退避/熔断/恢复能力且可观测 | DONE |
| TA-P13-006 | Phase 13 | SDK TS/Python 核心能力一致性校验 | DX + Backend + QA | 1 | TA-P13-001 | sdk parity check script + manifest | 核心方法、API 前缀、错误模型一致 | DONE |
| TA-P13-007 | Phase 13 | Phase 13 Gate 评审与收口 | TL + QA | 0.5 | TA-P13-002, TA-P13-003, TA-P13-004, TA-P13-005, TA-P13-006 | gate 结论文档 | Phase 13 正式关闭 | DONE |
| TA-P14-001 | Phase 14 | 冻结产品聚焦边界（回归核心 P2P 应用） | TL + BE + FE + QA | 0.5 | TA-P13-007 | boundary decision doc | Phase 14 范围与 Phase 15 分工冻结 | DONE |
| TA-P14-002 | Phase 14 | 删除默认 Web 运维面板，保留核心聊天流程 | Frontend | 1 | TA-P14-001 | web app cleanup + build log | 默认界面仅保留核心链路入口，构建通过 | DONE |
| TA-P14-003 | Phase 14 | 消息拉取稳定游标改造（替代 offset 风险） | Backend + QA | 1.5 | TA-P14-001 | pull cursor upgrade + tests | 清理/撤回场景下分页稳定无重复/跳项 | DONE |
| TA-P14-004 | Phase 14 | direct 会话访问控制强化（参与方约束） | Backend + Security | 1.5 | TA-P14-001 | direct ACL guard + tests | 非参与方消息写入被拒绝并返回 RFC7807 | DONE |
| TA-P14-005 | Phase 14 | TS/Python SDK 核心行为收敛 | DX + Backend + QA | 1 | TA-P14-003, TA-P14-004 | sdk parity extension + checks | 参数、错误语义、返回结构一致 | DONE |
| TA-P14-006 | Phase 14 | Phase 14 Gate 评审与收口 | TL + QA | 0.5 | TA-P14-002, TA-P14-003, TA-P14-004, TA-P14-005 | gate 结论文档 | Phase 14 正式关闭 | DONE |
| TA-P15-001 | Phase 15 | Web App 工业级规划总纲冻结 | TL + FE + BE + QA + DX | 1 | TA-P14-001 | industrial planning doc | 功能/架构/平台/质量主线冻结 | DONE |
| TA-P15-002 | Phase 15 | 功能域与 IA 设计（会话/消息/群组/身份） | FE + Product + BE | 2 | TA-P15-001 | IA + feature matrix | 关键用户旅程与页面结构冻结 | DONE |
| TA-P15-003 | Phase 15 | 设计系统与组件规范 | FE + Design | 2 | TA-P15-001 | design tokens + component spec | 主题、组件、可访问性基线可复用 | DONE |
| TA-P15-004 | Phase 15 | 多平台架构（Web/PWA/Desktop/Mobile） | FE + DX + BE | 2 | TA-P15-001 | platform architecture doc | 共享核心层与平台适配边界冻结 | DONE |
| TA-P15-005 | Phase 15 | 离线同步与冲突解决策略 | FE + BE + QA | 2 | TA-P15-004 | offline-sync strategy + test plan | 离线队列、重放、冲突策略可验证 | DONE |
| TA-P15-006 | Phase 15 | 客户端质量体系与发布门禁 | QA + FE + SRE | 1.5 | TA-P15-002, TA-P15-003, TA-P15-004, TA-P15-005 | quality gates + release checklist | 单测/E2E/性能/崩溃门禁成体系 | DONE |
| TA-P15-007 | Phase 15 | Phase 15 Gate 评审与收口 | TL + QA | 0.5 | TA-P15-006 | gate 结论文档 | Phase 15 正式关闭 | DONE |
| TA-P16-001 | Phase 16 | Web App 路由化壳层 + 统一 API Client + RFC7807 错误处理 + Web 单测基线（JS 原型） | Frontend + QA | 2 | TA-P15-007 | legacy js runtime prototype | 形成首轮端到端 JS 原型 | DONE |
| TA-P16-002 | Phase 16 | 会话域增强（JS 原型） | Frontend + QA | 1.5 | TA-P16-001 | legacy js sessions improvements | 会话拉取/发送交互在 JS 原型上可验证 | DONE |
| TA-P16-003 | Phase 16 | 群组域增强（JS 原型） | Frontend + Backend + QA | 1.5 | TA-P16-001 | legacy js groups improvements | 群组链路在 JS 原型上可验证 | DONE |
| TA-P16-004 | Phase 16 | Web App 技术栈重规划（TypeScript + React + Vite） | Frontend + DX + QA | 1.5 | TA-P16-003 | ts/react/vite baseline + migration evidence | JS 原型下线，TS 框架基线可 typecheck/build/test | DONE |
| TA-P16-005 | Phase 16 | 身份与节点诊断增强（TS 基线） | Frontend + Backend | 1 | TA-P16-004 | identity/settings enhancements | 自身份、DID 解析、节点状态展示可验证 | TODO |
| TA-P16-006 | Phase 16 | Web 契约回归与异常语义测试增强 | QA + Frontend | 1 | TA-P16-004, TA-P16-005 | web contract/e2e checks + manifest | `/api/v1/*`、RFC7807、DID 约束均回归通过 | TODO |
| TA-P16-006 | Phase 16 | Web 质量收口（构建产物校验、专项脚本、发布前检查） | Frontend + QA + DX | 1 | TA-P16-005 | quality checklist + logs + manifest | Web 交付门禁可重复执行且结论 PASS | TODO |
| TA-P16-007 | Phase 16 | Phase 16 Gate 评审与收口 | TL + QA | 0.5 | TA-P16-006 | gate 结论文档 | Phase 16 正式关闭 | TODO |

## 4. 执行节奏建议（按部就班）

1. 每周一更新本 WBS 状态（至少更新一次）。
2. 每个 Phase 末执行 Gate Review：未通过不得进入下一阶段。
3. 高优先级缺陷（P0/P1）必须在当前阶段清零。
4. 每个 DONE 任务必须附带证据链接（测试报告、PR、部署记录）。

## 5. 验收证据模板

建议每个任务附加以下证据：

- 代码提交或 PR 链接
- 自动化测试输出
- 文档或报告路径
- 回滚验证记录（如涉及链上变更）

## 6. Day 1 执行记录（2026-03-02）

> 统一回报格式：Task ID / 状态 / 证据链接 / 阻塞项 / 下一步动作

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P0-001 | DONE | `docs/implementation/phase-0/ta-p0-001-api-path-freeze.md` | 无 | 进入 Phase 2 API 路由实现前复用此清单做静态检查 |
| TA-P0-002 | DONE | `docs/implementation/phase-0/ta-p0-002-envelope-freeze.md` | 无 | 在 Phase 2 契约测试中固化成功/错误 envelope 断言 |
| TA-P0-003 | DONE | `docs/implementation/phase-0/ta-p0-003-error-code-dictionary.md` | 无 | 在 API 错误处理中映射固定 code 与 type URI |
| TA-P0-004 | DONE | `docs/implementation/phase-0/ta-p0-004-did-auth-rfc.md` | 无 | 在 IdentityAdapter 中按固定顺序实现 active/controller 校验 |
| TA-P0-005 | DONE | `docs/implementation/phase-0/ta-p0-005-group-state-machine-rfc.md` | 无 | Phase 3 Indexer 与 reorg 测试直接引用状态机图 |
| TA-P0-006 | DONE | `docs/implementation/phase-0/ta-p0-006-domain-proof-v1-spec.md` | 无 | Phase 2/4 联邦和建群流程中实现域名一致性校验 |
| TA-P0-007 | DONE | `docs/implementation/phase-0/ta-p0-007-test-strategy.md`, `docs/implementation/phase-0/day1-baseline-check.md`, `docs/implementation/phase-0/logs/2026-03-02-pnpm-install-escalated.log`, `docs/implementation/phase-0/logs/2026-03-02-pnpm-build-escalated.log`, `docs/implementation/phase-0/logs/2026-03-02-pnpm-test-escalated-unrestricted.log` | 无 | 维持日志归档，供 Gate 复核引用 |
| TA-P0-008 | DONE | `docs/implementation/phase-0/ta-p0-008-gate-mechanism.md`, `docs/implementation/gates/phase-0-gate.md`, `docs/implementation/gates/phase-0-risk-register.md`, `docs/implementation/phase-0/week1-closeout-execution-plan.md`, `docs/implementation/phase-0/week1-progress-2026-03-02.md` | 无 | Week 2 按计划启动 `TA-P1-001`（不提前切阶段开发） |

## 7. Phase 1 启动准备（2026-03-02）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P1-001 | DONE | `docs/implementation/phase-1/ta-p1-001-contract-interface-review-2026-03-02.md`, `docs/implementation/phase-1/README.md` | 无 | 启动 `TA-P1-002` 实现与最小验收闭环 |
| TA-P1-002 | DONE | `docs/implementation/phase-1/ta-p1-002-implementation-checkpoint-2026-03-02.md`, `docs/implementation/phase-1/ta-p1-002-deploy-check-2026-03-02.md` | 无 | 进入 `TA-P1-003` / `TA-P1-004` 验收补齐 |
| TA-P1-003 | DONE | `docs/implementation/phase-1/ta-p1-003-permission-constraint-checkpoint-2026-03-02.md`, `docs/implementation/phase-1/ta-p1-003-test-run-2026-03-02.md`, `packages/contracts/test/TelagentGroupRegistry.test.ts` | 无 | 进入 TA-P1-005/TA-P1-006 测试收敛 |
| TA-P1-004 | DONE | `docs/implementation/phase-1/ta-p1-004-event-model-checkpoint-2026-03-02.md`, `docs/implementation/phase-1/ta-p1-001-contract-interface-review-2026-03-02.md` | 无 | 进入 TA-P1-005/TA-P1-006 测试收敛 |
| TA-P1-005 | DONE | `docs/implementation/phase-1/ta-p1-005-positive-test-report-2026-03-02.md`, `packages/contracts/test/TelagentGroupRegistry.test.ts` | 无 | 进入 TA-P1-007 部署阶段 |
| TA-P1-006 | DONE | `docs/implementation/phase-1/ta-p1-006-negative-test-report-2026-03-02.md`, `docs/implementation/phase-1/ta-p1-003-test-run-2026-03-02.md` | 无 | 进入 TA-P1-007 部署阶段 |
| TA-P1-007 | DONE | `packages/contracts/scripts/deploy-telagent-group-registry.ts`, `docs/implementation/phase-1/ta-p1-007-deploy-script-checkpoint-2026-03-02.md`, `docs/implementation/phase-1/manifests/2026-03-02-local-deploy-manifest.json`, `docs/implementation/phase-1/manifests/2026-03-02-testnet-deploy-manifest.json`, `docs/implementation/phase-1/manifests/2026-03-02-testnet-deploy-success.txt` | 无 | 进入 `TA-P1-008`/`TA-P1-009` 收口与 Gate 准备 |
| TA-P1-008 | DONE | `packages/contracts/scripts/rollback-telagent-group-registry.ts`, `packages/contracts/scripts/rollback-drill-local.ts`, `docs/implementation/phase-1/ta-p1-008-rollback-runbook-2026-03-02.md`, `docs/implementation/phase-1/manifests/2026-03-02-local-rollback-drill.json`, `docs/implementation/phase-1/manifests/2026-03-02-testnet-rollback-drill.json`, `docs/implementation/phase-1/manifests/2026-03-02-testnet-rollback-drill.txt` | 无 | 进入 `TA-P1-011` Gate 材料汇总 |
| TA-P1-009 | DONE | `docs/implementation/phase-1/ta-p1-009-abi-address-manifest-2026-03-02.md`, `docs/implementation/phase-1/manifests/2026-03-02-telagent-group-registry-abi.json`, `docs/implementation/phase-1/manifests/2026-03-02-local-deploy-manifest.json`, `docs/implementation/phase-1/manifests/2026-03-02-testnet-deploy-manifest.json`, `docs/implementation/phase-1/manifests/2026-03-02-deploy-manifest.json` | 无 | 进入 `TA-P1-010`（可选收口）与 `TA-P1-011` Gate 归档 |
| TA-P1-010 | DONE | `docs/implementation/phase-1/ta-p1-010-router-module-registration-2026-03-03.md`, `packages/contracts/scripts/register-telagent-group-module.ts`, `packages/contracts/scripts/run-phase1-router-module-check.ts`, `packages/contracts/contracts/mocks/MockClawRouter.sol`, `docs/implementation/phase-1/manifests/2026-03-03-p1-router-module-check.json`, `docs/implementation/phase-1/logs/2026-03-03-p1-router-module-check-run.txt` | 无 | 进入 `TA-P1-011` Gate 归档补全 |
| TA-P1-011 | DONE | `docs/implementation/gates/phase-1-gate.md`, `docs/implementation/phase-1/README.md`, `docs/implementation/phase-1/manifests/2026-03-02-deploy-manifest.json` | 无 | Phase 1 已正式关闭，允许按 Gate 结论进入 Phase 2 |

## 8. Phase 2 收口执行（2026-03-02）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P2-001 | DONE | `docs/implementation/phase-2/ta-p2-001-api-server-route-mount-2026-03-02.md`, `packages/node/src/api/server.ts`, `packages/node/src/api/router.ts`, `packages/node/src/api-prefix.test.ts`, `docs/implementation/phase-2/logs/2026-03-02-p2-api-contract-test.txt` | 无 | 继续推进 `TA-P2-004` / `TA-P2-005` |
| TA-P2-002 | DONE | `docs/implementation/phase-2/ta-p2-002-response-envelope-checkpoint-2026-03-02.md`, `packages/node/src/api/response.ts`, `packages/node/src/api/routes/messages.ts`, `packages/node/src/api/routes/groups.ts`, `packages/node/src/api-contract.test.ts` | 无 | 继续推进 `TA-P2-008`（消息/附件/联邦路由收口） |
| TA-P2-003 | DONE | `docs/implementation/phase-2/ta-p2-003-rfc7807-error-pipeline-2026-03-02.md`, `packages/protocol/src/errors.ts`, `packages/node/src/api/route-utils.ts`, `packages/node/src/api/response.ts`, `packages/node/src/api-contract.test.ts` | 无 | 继续推进 `TA-P2-009` 契约测试扩展与汇总 |
| TA-P2-004 | DONE | `docs/implementation/phase-2/ta-p2-004-identity-adapter-service-2026-03-02.md`, `packages/node/src/services/identity-adapter-service.ts`, `packages/node/src/api/routes/identities.ts` | 无 | 继续推进 `TA-P2-005` / `TA-P2-006` |
| TA-P2-005 | DONE | `docs/implementation/phase-2/ta-p2-005-gas-service-preflight-2026-03-02.md`, `packages/node/src/services/gas-service.ts`, `packages/node/src/services/gas-service.test.ts`, `docs/implementation/phase-2/logs/2026-03-02-p2-node-test.txt` | 无 | 继续推进 `TA-P2-006` 链上流程联调 |
| TA-P2-006 | DONE | `docs/implementation/phase-2/ta-p2-006-group-service-onchain-writeflow-2026-03-02.md`, `packages/node/src/services/group-service.ts`, `docs/implementation/phase-2/manifests/2026-03-02-p2-testnet-integration.json` | 无 | 继续推进 `TA-P2-007` / `TA-P2-010` |
| TA-P2-007 | DONE | `docs/implementation/phase-2/ta-p2-007-identities-groups-api-2026-03-02.md`, `packages/node/src/api/routes/identities.ts`, `packages/node/src/api/routes/groups.ts`, `packages/node/src/api/router.ts` | 无 | 继续推进 `TA-P2-009` |
| TA-P2-008 | DONE | `docs/implementation/phase-2/ta-p2-008-messages-attachments-federation-skeleton-2026-03-02.md`, `packages/node/src/api/routes/messages.ts`, `packages/node/src/api/routes/attachments.ts`, `packages/node/src/api/routes/federation.ts` | 无 | 继续推进 `TA-P2-009` |
| TA-P2-009 | DONE | `docs/implementation/phase-2/ta-p2-009-api-contract-test-suite-2026-03-02.md`, `packages/node/src/api-contract.test.ts`, `packages/node/src/api-prefix.test.ts`, `packages/node/package.json`, `docs/implementation/phase-2/logs/2026-03-02-p2-node-build.txt`, `docs/implementation/phase-2/logs/2026-03-02-p2-node-test.txt` | 无 | 进入 `TA-P2-011` Gate 材料汇总 |
| TA-P2-010 | DONE | `docs/implementation/phase-2/ta-p2-010-testnet-integration-2026-03-02.md`, `packages/node/scripts/run-phase2-testnet-integration.ts`, `docs/implementation/phase-2/logs/2026-03-02-p2-testnet-integration-run.txt`, `docs/implementation/phase-2/manifests/2026-03-02-p2-testnet-integration.json` | 无 | 进入 `TA-P2-011` Gate 评审 |
| TA-P2-011 | DONE | `docs/implementation/gates/phase-2-gate.md`, `docs/implementation/phase-2/README.md` | 无 | Phase 2 已正式关闭，按 Gate 结论进入 Phase 3 |

## 9. Phase 3 收口执行（2026-03-02）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P3-001 | DONE | `docs/implementation/phase-3/ta-p3-001-storage-schema-2026-03-02.md`, `packages/node/src/storage/group-repository.ts`, `docs/implementation/phase-3/logs/2026-03-02-p3-node-build.txt` | 无 | 继续推进 `TA-P3-002` / `TA-P3-005` |
| TA-P3-002 | DONE | `docs/implementation/phase-3/ta-p3-002-group-indexer-subscription-decode-2026-03-02.md`, `packages/node/src/indexer/group-indexer.ts`, `packages/node/src/indexer/group-indexer.test.ts` | 无 | 继续推进 `TA-P3-003` / `TA-P3-004` |
| TA-P3-003 | DONE | `docs/implementation/phase-3/ta-p3-003-pending-finalized-dual-view-2026-03-02.md`, `packages/node/src/storage/group-repository.ts`, `packages/node/src/api/routes/groups.ts`, `packages/node/src/indexer/group-indexer.test.ts` | 无 | 继续推进 `TA-P3-007` |
| TA-P3-004 | DONE | `docs/implementation/phase-3/ta-p3-004-finality-depth-2026-03-02.md`, `packages/node/src/indexer/group-indexer.ts`, `docs/implementation/phase-3/logs/2026-03-02-p3-node-test.txt` | 无 | 继续推进 `TA-P3-005` |
| TA-P3-005 | DONE | `docs/implementation/phase-3/ta-p3-005-reorg-rollback-replay-2026-03-02.md`, `packages/node/src/indexer/group-indexer.ts`, `packages/node/scripts/rebuild-group-read-model.ts`, `docs/implementation/phase-3/logs/2026-03-02-p3-rebuild-read-model-run.txt` | 无 | 继续推进 `TA-P3-006` / `TA-P3-007` |
| TA-P3-006 | DONE | `docs/implementation/phase-3/ta-p3-006-reorg-injection-test-2026-03-02.md`, `packages/node/src/indexer/group-indexer.test.ts`, `docs/implementation/phase-3/logs/2026-03-02-p3-node-test.txt` | 无 | 进入 `TA-P3-008` Gate 材料汇总 |
| TA-P3-007 | DONE | `docs/implementation/phase-3/ta-p3-007-consistency-checker-2026-03-02.md`, `packages/node/scripts/run-phase3-consistency-check.ts`, `docs/implementation/phase-3/logs/2026-03-02-p3-consistency-check-run.txt`, `docs/implementation/phase-3/manifests/2026-03-02-p3-consistency-check.json` | 无 | 进入 `TA-P3-008` Gate 评审 |
| TA-P3-008 | DONE | `docs/implementation/gates/phase-3-gate.md`, `docs/implementation/phase-3/README.md` | 无 | Phase 3 已正式关闭，按 Gate 结论进入 Phase 4 |

## 10. Phase 4A 执行快照（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P4-001 | DONE | `docs/implementation/phase-4/phase-4-boundary-and-acceptance-2026-03-03.md`, `docs/implementation/phase-4/ta-p4-001-signal-mls-adapter-interface-freeze-2026-03-03.md`, `packages/protocol/src/crypto-adapters.ts`, `packages/protocol/src/index.ts`, `packages/protocol/README.md` | 无 | 继续推进 `TA-P4-002` 与 `TA-P4-003` |
| TA-P4-002 | DONE | `docs/implementation/phase-4/ta-p4-002-seq-allocator-monotonic-2026-03-03.md`, `packages/node/src/services/sequence-allocator.ts`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/message-service.test.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt` | 无 | 继续推进 `TA-P4-003` |
| TA-P4-003 | DONE | `docs/implementation/phase-4/ta-p4-003-envelope-dedupe-idempotent-write-2026-03-03.md`, `packages/protocol/src/schema.ts`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/message-service.test.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt` | 无 | 继续推进 `TA-P4-004` |
| TA-P4-004 | DONE | `docs/implementation/phase-4/ta-p4-004-mailbox-ttl-cleanup-task-2026-03-03.md`, `packages/node/src/app.ts`, `packages/node/src/config.ts`, `.env.example`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/message-service.test.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-build.txt`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt` | 无 | 继续推进 `TA-P4-005` |
| TA-P4-005 | DONE | `docs/implementation/phase-4/ta-p4-005-provisional-mark-retract-2026-03-03.md`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/message-service.test.ts`, `packages/node/src/app.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`, `docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt` | 无 | 进入 `TA-P4-006` |
| TA-P4-006 | DONE | `docs/implementation/phase-4/ta-p4-006-attachment-manifest-validation-2026-03-03.md`, `packages/node/src/services/attachment-service.ts`, `packages/node/src/services/attachment-service.test.ts`, `packages/protocol/src/schema.ts`, `packages/node/src/api-contract.test.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`, `docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt` | 无 | 进入 `TA-P4-007` |
| TA-P4-007 | DONE | `docs/implementation/phase-4/ta-p4-007-federation-auth-rate-limit-retry-2026-03-03.md`, `packages/node/src/services/federation-service.ts`, `packages/node/src/services/federation-service.test.ts`, `packages/node/src/api/routes/federation.ts`, `packages/protocol/src/errors.ts`, `packages/node/src/config.ts`, `.env.example`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt` | 无 | 进入 `TA-P4-008` |
| TA-P4-008 | DONE | `docs/implementation/phase-4/ta-p4-008-node-info-domain-consistency-2026-03-03.md`, `packages/node/src/services/federation-service.ts`, `packages/node/src/services/federation-service.test.ts`, `packages/node/src/api/routes/federation.ts`, `packages/node/src/api-contract.test.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`, `docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt` | 无 | 进入 `TA-P4-009` |
| TA-P4-009 | DONE | `docs/implementation/phase-4/ta-p4-009-e2e-main-path-2026-03-03.md`, `packages/node/src/phase4-e2e.test.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`, `docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt` | 无 | 进入 `TA-P4-010` |
| TA-P4-010 | DONE | `docs/implementation/phase-4/ta-p4-010-e2e-offline-24h-dedupe-order-2026-03-03.md`, `packages/node/src/phase4-e2e.test.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`, `docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt` | 无 | 进入 `TA-P4-011` |
| TA-P4-011 | DONE | `docs/implementation/phase-4/ta-p4-011-load-test-500-members-2026-03-03.md`, `packages/node/scripts/run-phase4-load-test.ts`, `docs/implementation/phase-4/logs/2026-03-03-p4-load-test-run.txt`, `docs/implementation/phase-4/manifests/2026-03-03-p4-load-test.json`, `docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`, `docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt` | 无 | 进入 `TA-P4-012` |
| TA-P4-012 | DONE | `docs/implementation/phase-4/ta-p4-012-phase4-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-4-gate.md`, `docs/implementation/phase-4/README.md` | 无 | Phase 4 已关闭，进入 `TA-P5-001` |

## 11. Phase 5 启动执行（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P5-001 | DONE | `docs/implementation/phase-5/ta-p5-001-web-console-flow-2026-03-03.md`, `packages/web/src/index.html`, `packages/web/src/main.js`, `packages/web/src/styles.css`, `docs/implementation/phase-5/logs/2026-03-03-p5-web-build.txt`, `docs/implementation/phase-5/logs/2026-03-03-p5-workspace-test.txt` | 无 | 进入 `TA-P5-002` |
| TA-P5-002 | DONE | `docs/implementation/phase-5/ta-p5-002-monitoring-dashboard-alerts-2026-03-03.md`, `packages/node/src/services/node-monitoring-service.ts`, `packages/node/src/services/node-monitoring-service.test.ts`, `packages/node/src/api/routes/node.ts`, `packages/node/src/api/server.ts`, `packages/web/src/index.html`, `packages/web/src/main.js`, `packages/web/src/styles.css`, `docs/implementation/phase-5/manifests/2026-03-03-p5-monitoring-dashboard.json`, `docs/implementation/phase-5/manifests/2026-03-03-p5-alert-rules.yaml`, `docs/implementation/phase-5/logs/2026-03-03-p5-node-test.txt`, `docs/implementation/phase-5/logs/2026-03-03-p5-workspace-test.txt` | 无 | 进入 `TA-P5-003` |
| TA-P5-003 | DONE | `docs/implementation/phase-5/ta-p5-003-fault-injection-drill-2026-03-03.md`, `packages/node/scripts/run-phase5-fault-injection.ts`, `docs/implementation/phase-5/logs/2026-03-03-p5-fault-injection-run.txt`, `docs/implementation/phase-5/manifests/2026-03-03-p5-fault-injection-drill.json`, `docs/implementation/phase-5/logs/2026-03-03-p5-node-test.txt`, `docs/implementation/phase-5/logs/2026-03-03-p5-workspace-test.txt` | 无 | 进入 `TA-P5-004` |
| TA-P5-004 | DONE | `docs/implementation/phase-5/ta-p5-004-security-review-checklist-2026-03-03.md`, `packages/node/scripts/run-phase5-security-review.ts`, `docs/implementation/phase-5/logs/2026-03-03-p5-security-review-run.txt`, `docs/implementation/phase-5/manifests/2026-03-03-p5-security-review.json` | 无 | 进入 `TA-P5-005` |
| TA-P5-005 | DONE | `docs/implementation/phase-5/ta-p5-005-readiness-report-2026-03-03.md`, `docs/implementation/phase-5/manifests/2026-03-03-p5-readiness-report.json`, `docs/implementation/phase-5/README.md` | 无 | 进入 `TA-P5-006` |
| TA-P5-006 | DONE | `docs/implementation/phase-5/ta-p5-006-mvp-signoff-version-freeze-2026-03-03.md`, `docs/implementation/phase-5/manifests/2026-03-03-p5-version-freeze.json`, `docs/implementation/gates/phase-5-gate.md` | 无 | Phase 5 已关闭，进入发布流程执行 |
| TA-RLS-001 | DONE | `docs/implementation/release/ta-rls-001-release-preflight-2026-03-03.md`, `docs/implementation/release/manifests/2026-03-03-v0.1.0-release-preflight.json`, `docs/implementation/release/logs/2026-03-03-v0.1.0-release-preflight-run.txt`, `packages/node/scripts/run-release-preflight.ts` | 无 | 可执行 `v0.1.0` tag 与 release 发布 |
| TA-RLS-002 | DONE | `docs/implementation/release/ta-rls-002-v0.1.0-tag-and-release-note-2026-03-03.md`, `docs/implementation/release/manifests/2026-03-03-v0.1.0-release-tag.json`, `docs/implementation/release/logs/2026-03-03-v0.1.0-tag-push.txt`, `git tag v0.1.0` | 无 | 发布编排完成，进入 Phase 6 改进项 |

## 12. Phase 6 发布后改进（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P6-001 | DONE | `docs/implementation/phase-6/ta-p6-001-mailbox-persistence-2026-03-03.md`, `packages/node/src/storage/message-repository.ts`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/message-service.test.ts`, `packages/node/scripts/run-phase6-mailbox-persistence-check.ts`, `docs/implementation/phase-6/manifests/2026-03-03-p6-mailbox-persistence-check.json`, `docs/implementation/phase-6/logs/2026-03-03-p6-node-test.txt`, `docs/implementation/phase-6/logs/2026-03-03-p6-mailbox-persistence-check-run.txt` | 无 | 进入 `TA-P6-002` 多实例共享状态方案设计 |
| TA-P6-002 | DONE | `docs/implementation/phase-6/ta-p6-002-mailbox-multi-instance-adr-2026-03-03.md`, `docs/implementation/phase-6/manifests/2026-03-03-p6-mailbox-multi-instance-adr.json`, `docs/implementation/phase-6/README.md` | 无 | 进入 `TA-P6-003`（store adapter + Postgres backend 实现） |
| TA-P6-003 | DONE | `docs/implementation/phase-6/ta-p6-003-mailbox-store-adapter-postgres-2026-03-03.md`, `packages/node/src/storage/mailbox-store.ts`, `packages/node/src/storage/postgres-message-repository.ts`, `packages/node/src/config.ts`, `packages/node/src/app.ts`, `packages/node/src/services/message-service.ts`, `packages/node/src/config.test.ts`, `packages/node/scripts/run-phase6-store-backend-check.ts`, `docs/implementation/phase-6/manifests/2026-03-03-p6-store-backend-check.json`, `docs/implementation/phase-6/logs/2026-03-03-p6-store-backend-check-run.txt` | 无 | 进入 `TA-P6-004`（发布后稳定性回归与 Gate） |
| TA-P6-004 | DONE | `docs/implementation/phase-6/ta-p6-004-phase6-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-6-gate.md`, `docs/implementation/phase-6/README.md`, `docs/implementation/phase-6/logs/2026-03-03-p6-workspace-test.txt` | 无 | Phase 6 已关闭；Phase 7/Phase 8/Phase 9/Phase 10 已收口，进入联邦跨域常态运维 |

## 13. Phase 7 Postgres 集群压测与故障演练（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P7-001 | DONE | `docs/implementation/phase-7/ta-p7-001-phase7-boundary-acceptance-2026-03-03.md`, `docs/implementation/phase-7/README.md` | 无 | 进入 `TA-P7-002` 多实例一致性校验 |
| TA-P7-002 | DONE | `docs/implementation/phase-7/ta-p7-002-postgres-multi-instance-check-2026-03-03.md`, `packages/node/scripts/run-phase7-postgres-multi-instance-check.ts`, `docs/implementation/phase-7/manifests/2026-03-03-p7-postgres-multi-instance-check.json`, `docs/implementation/phase-7/logs/2026-03-03-p7-postgres-multi-instance-check-run.txt` | 无 | 进入 `TA-P7-003` 故障演练 |
| TA-P7-003 | DONE | `docs/implementation/phase-7/ta-p7-003-postgres-fault-drill-2026-03-03.md`, `packages/node/scripts/run-phase7-postgres-fault-drill.ts`, `docs/implementation/phase-7/manifests/2026-03-03-p7-postgres-fault-drill.json`, `docs/implementation/phase-7/logs/2026-03-03-p7-postgres-fault-drill-run.txt` | 无 | 进入 `TA-P7-004` Gate 收口 |
| TA-P7-004 | DONE | `docs/implementation/phase-7/ta-p7-004-phase7-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-7-gate.md`, `docs/implementation/phase-7/logs/2026-03-03-p7-node-build.txt`, `docs/implementation/phase-7/logs/2026-03-03-p7-node-test.txt` | 无 | Phase 7 已关闭，Phase 8/Phase 9/Phase 10 已收口，进入联邦跨域常态运维 |

## 14. Phase 8 联邦韧性与可观测增强（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P8-001 | DONE | `docs/implementation/phase-8/ta-p8-001-phase8-boundary-acceptance-2026-03-03.md`, `docs/implementation/phase-8/README.md` | 无 | 进入 `TA-P8-002` 联邦状态同步韧性改造 |
| TA-P8-002 | DONE | `docs/implementation/phase-8/ta-p8-002-federation-state-version-guard-2026-03-03.md`, `packages/node/src/services/federation-service.ts`, `packages/node/src/services/federation-service.test.ts`, `packages/node/src/api/routes/federation.ts`, `packages/node/src/api-contract.test.ts` | 无 | 进入 `TA-P8-003` 脚本化演练 |
| TA-P8-003 | DONE | `docs/implementation/phase-8/ta-p8-003-federation-resilience-check-2026-03-03.md`, `packages/node/scripts/run-phase8-federation-resilience-check.ts`, `docs/implementation/phase-8/manifests/2026-03-03-p8-federation-resilience-check.json`, `docs/implementation/phase-8/logs/2026-03-03-p8-federation-resilience-check-run.txt` | 无 | 进入 `TA-P8-004` Gate 收口 |
| TA-P8-004 | DONE | `docs/implementation/phase-8/ta-p8-004-phase8-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-8-gate.md`, `docs/implementation/phase-8/logs/2026-03-03-p8-node-build.txt`, `docs/implementation/phase-8/logs/2026-03-03-p8-node-test.txt`, `docs/implementation/phase-8/logs/2026-03-03-p8-workspace-test.txt` | 无 | Phase 8 已关闭，Phase 9/Phase 10 已收口，进入联邦跨域常态运维 |

## 15. Phase 9 联邦跨域运行手册与灰度兼容（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P9-001 | DONE | `docs/implementation/phase-9/ta-p9-001-phase9-boundary-acceptance-2026-03-03.md`, `docs/implementation/phase-9/README.md` | 无 | 进入 `TA-P9-002` 兼容矩阵实现 |
| TA-P9-002 | DONE | `docs/implementation/phase-9/ta-p9-002-federation-protocol-compatibility-2026-03-03.md`, `packages/node/src/services/federation-service.ts`, `packages/node/src/services/federation-service.test.ts`, `packages/node/src/api/routes/federation.ts`, `packages/node/src/api-contract.test.ts`, `packages/node/src/config.ts`, `packages/node/src/config.test.ts`, `.env.example` | 无 | 进入 `TA-P9-003` 脚本化校验 |
| TA-P9-003 | DONE | `docs/implementation/phase-9/ta-p9-003-federation-protocol-compat-check-2026-03-03.md`, `packages/node/scripts/run-phase9-federation-protocol-compat-check.ts`, `docs/implementation/phase-9/manifests/2026-03-03-p9-federation-protocol-compat-check.json`, `docs/implementation/phase-9/logs/2026-03-03-p9-federation-protocol-compat-check-run.txt` | 无 | 进入 `TA-P9-004` Gate 收口 |
| TA-P9-004 | DONE | `docs/implementation/phase-9/ta-p9-004-phase9-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-9-gate.md`, `docs/implementation/phase-9/logs/2026-03-03-p9-node-build.txt`, `docs/implementation/phase-9/logs/2026-03-03-p9-node-test.txt`, `docs/implementation/phase-9/logs/2026-03-03-p9-workspace-test.txt` | 无 | Phase 9 已关闭，Phase 10 已收口并关闭 |

## 16. Phase 10 联邦灰度发布自动化与应急回滚编排（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P10-001 | DONE | `docs/implementation/phase-10/ta-p10-001-phase10-boundary-acceptance-2026-03-03.md`, `docs/implementation/phase-10/README.md` | 无 | 进入 `TA-P10-002` 灰度发布自动化脚本落地 |
| TA-P10-002 | DONE | `docs/implementation/phase-10/ta-p10-002-federation-rollout-automation-2026-03-03.md`, `packages/node/scripts/run-phase10-federation-rollout-automation.ts`, `docs/implementation/phase-10/manifests/2026-03-03-p10-federation-rollout-automation.json`, `docs/implementation/phase-10/logs/2026-03-03-p10-federation-rollout-automation-run.txt` | 无 | 进入 `TA-P10-003` 应急回滚演练 |
| TA-P10-003 | DONE | `docs/implementation/phase-10/ta-p10-003-federation-rollback-drill-2026-03-03.md`, `packages/node/scripts/run-phase10-federation-rollback-drill.ts`, `docs/implementation/phase-10/manifests/2026-03-03-p10-federation-rollback-drill.json`, `docs/implementation/phase-10/logs/2026-03-03-p10-federation-rollback-drill-run.txt` | 无 | 进入 `TA-P10-004` Gate 收口 |
| TA-P10-004 | DONE | `docs/implementation/phase-10/ta-p10-004-phase10-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-10-gate.md`, `docs/implementation/phase-10/logs/2026-03-03-p10-node-build.txt`, `docs/implementation/phase-10/logs/2026-03-03-p10-node-test.txt`, `docs/implementation/phase-10/logs/2026-03-03-p10-workspace-test.txt` | 无 | Phase 10 已关闭，进入联邦跨域常态运维 |

## 17. Phase 11 v1.1 安全与运营能力增强（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P11-001 | DONE | `docs/implementation/phase-11/ta-p11-001-phase11-boundary-acceptance-2026-03-03.md`, `docs/implementation/phase-11/README.md` | 无 | 进入 `TA-P11-002` Node Runtime/CI 基线固化 |
| TA-P11-002 | DONE | `docs/implementation/phase-11/ta-p11-002-runtime-ci-baseline-2026-03-03.md`, `.nvmrc`, `.node-version`, `scripts/check-runtime.mjs`, `.github/workflows/ci.yml`, `docs/implementation/phase-11/logs/2026-03-03-p11-runtime-check.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-workspace-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-workspace-test.txt` | 无 | 进入 `TA-P11-003` DomainProof 自动挑战设计与实现 |
| TA-P11-003 | DONE | `docs/implementation/phase-11/ta-p11-003-domain-proof-auto-challenge-rotation-2026-03-03.md`, `packages/node/src/services/domain-proof-challenge-service.ts`, `packages/node/src/services/domain-proof-challenge-service.test.ts`, `packages/node/src/services/group-service.ts`, `packages/node/src/app.ts`, `packages/node/src/config.ts`, `packages/node/src/config.test.ts`, `packages/node/scripts/run-phase11-domain-proof-challenge-check.ts`, `.env.example`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-domain-proof-challenge-check-run.txt`, `docs/implementation/phase-11/manifests/2026-03-03-p11-domain-proof-challenge-check.json` | 无 | 进入 `TA-P11-004` 联邦 pinning 与轮换策略 |
| TA-P11-004 | DONE | `docs/implementation/phase-11/ta-p11-004-federation-pinning-rotation-2026-03-03.md`, `packages/node/src/services/federation-service.ts`, `packages/node/src/services/federation-service.test.ts`, `packages/node/src/api/routes/federation.ts`, `packages/node/src/api-contract.test.ts`, `packages/node/src/config.ts`, `packages/node/src/config.test.ts`, `packages/node/scripts/run-phase11-federation-pinning-check.ts`, `.env.example`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-federation-pinning-check-run.txt`, `docs/implementation/phase-11/manifests/2026-03-03-p11-federation-pinning-check.json` | 无 | 进入 `TA-P11-005` 联邦 DLQ 与重放工具链 |
| TA-P11-005 | DONE | `docs/implementation/phase-11/ta-p11-005-federation-dlq-replay-toolchain-2026-03-03.md`, `packages/node/src/services/federation-service.ts`, `packages/node/src/services/federation-service.test.ts`, `packages/node/src/api/routes/federation.ts`, `packages/node/src/api-contract.test.ts`, `packages/node/scripts/run-phase11-federation-dlq-replay-check.ts`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-federation-dlq-replay-check-run.txt`, `docs/implementation/phase-11/manifests/2026-03-03-p11-federation-dlq-replay-check.json` | 无 | 进入 `TA-P11-006` Signal/MLS 密钥生命周期 |
| TA-P11-006 | DONE | `docs/implementation/phase-11/ta-p11-006-signal-mls-key-lifecycle-2026-03-03.md`, `packages/node/src/services/key-lifecycle-service.ts`, `packages/node/src/services/key-lifecycle-service.test.ts`, `packages/node/src/api/routes/keys.ts`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/message-service.test.ts`, `packages/node/scripts/run-phase11-key-lifecycle-check.ts`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-key-lifecycle-check-run.txt`, `docs/implementation/phase-11/manifests/2026-03-03-p11-key-lifecycle-check.json` | 无 | 进入 `TA-P11-007` revoked DID 会话失效链路 |
| TA-P11-007 | DONE | `docs/implementation/phase-11/ta-p11-007-revoked-did-session-invalidation-2026-03-03.md`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/message-service.test.ts`, `packages/node/src/app.ts`, `packages/node/scripts/run-phase11-revoked-did-session-check.ts`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-revoked-did-session-check-run.txt`, `docs/implementation/phase-11/manifests/2026-03-03-p11-revoked-did-session-check.json` | 无 | 进入 `TA-P11-008` Agent SDK TypeScript v0 |
| TA-P11-008 | DONE | `docs/implementation/phase-11/ta-p11-008-agent-sdk-typescript-v0-2026-03-03.md`, `packages/sdk/package.json`, `packages/sdk/tsconfig.json`, `packages/sdk/src/index.ts`, `packages/sdk/src/index.test.ts`, `packages/sdk/scripts/run-phase11-sdk-quickstart-check.ts`, `packages/sdk/README.md`, `docs/implementation/phase-11/logs/2026-03-03-p11-sdk-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-sdk-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-sdk-quickstart-check-run.txt`, `docs/implementation/phase-11/manifests/2026-03-03-p11-sdk-quickstart-check.json` | 无 | 进入 `TA-P11-009` Web Console v2 运营能力增强 |
| TA-P11-009 | DONE | `docs/implementation/phase-11/ta-p11-009-web-console-v2-ops-view-2026-03-03.md`, `packages/node/src/api/routes/messages.ts`, `packages/node/src/api-contract.test.ts`, `packages/node/src/api-prefix.test.ts`, `packages/web/src/index.html`, `packages/web/src/styles.css`, `packages/web/src/main.js`, `packages/web/scripts/run-phase11-console-v2-check.mjs`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-web-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-web-console-v2-check-run.txt`, `docs/implementation/phase-11/manifests/2026-03-03-p11-web-console-v2-check.json` | 无 | 进入 `TA-P11-010` Phase 11 Gate 收口 |
| TA-P11-010 | DONE | `docs/implementation/phase-11/ta-p11-010-phase11-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-11-gate.md`, `docs/implementation/phase-11/README.md`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-sdk-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-sdk-test.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-web-build.txt`, `docs/implementation/phase-11/logs/2026-03-03-p11-web-console-v2-check-run.txt` | 无 | Phase 11 已关闭，进入 `TA-P12-001` 候选池冻结 |

## 18. Phase 12 v1.2 候选池冻结与执行排程（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P12-001 | DONE | `docs/implementation/phase-12/ta-p12-001-phase12-candidate-pool-freeze-2026-03-03.md`, `docs/implementation/phase-12/manifests/2026-03-03-p12-candidate-pool-freeze.json`, `docs/implementation/phase-12/README.md` | 无 | 进入 `TA-P12-002` 链上/链下审计快照导出 |
| TA-P12-002 | DONE | `docs/implementation/phase-12/ta-p12-002-audit-snapshot-export-2026-03-03.md`, `packages/node/src/api/routes/node.ts`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/group-service.ts`, `packages/node/src/api-contract.test.ts`, `packages/node/src/services/message-service.test.ts`, `packages/node/scripts/run-phase12-audit-snapshot-check.ts`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-audit-snapshot-check-run.txt`, `docs/implementation/phase-12/manifests/2026-03-03-p12-audit-snapshot-check.json` | 无 | 进入 `TA-P12-003`（revoked DID 实时会话隔离） |
| TA-P12-003 | DONE | `docs/implementation/phase-12/ta-p12-003-revoked-did-realtime-session-isolation-2026-03-03.md`, `packages/node/src/services/identity-adapter-service.ts`, `packages/node/src/services/message-service.ts`, `packages/node/src/services/message-service.test.ts`, `packages/node/src/api/routes/node.ts`, `packages/node/src/api-contract.test.ts`, `packages/node/src/api-prefix.test.ts`, `packages/node/scripts/run-phase12-revoked-did-isolation-check.ts`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-revoked-did-isolation-check-run.txt`, `docs/implementation/phase-12/manifests/2026-03-03-p12-revoked-did-isolation-check.json` | 无 | 进入 `TA-P12-004`（联邦 SLO 自动化） |
| TA-P12-004 | DONE | `docs/implementation/phase-12/ta-p12-004-federation-slo-automation-2026-03-03.md`, `packages/node/src/services/federation-slo-service.ts`, `packages/node/src/services/federation-slo-service.test.ts`, `packages/node/src/services/node-monitoring-service.ts`, `packages/node/src/services/node-monitoring-service.test.ts`, `packages/node/src/app.ts`, `packages/node/src/api/routes/node.ts`, `packages/node/src/api-contract.test.ts`, `packages/node/src/config.ts`, `packages/node/src/config.test.ts`, `.env.example`, `packages/node/scripts/run-phase12-federation-slo-automation-check.ts`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-federation-slo-automation-check-run.txt`, `docs/implementation/phase-12/manifests/2026-03-03-p12-federation-slo-automation-check.json` | 无 | 进入 `TA-P12-005`（Agent SDK Python Beta） |
| TA-P12-005 | DONE | `docs/implementation/phase-12/ta-p12-005-agent-sdk-python-beta-2026-03-03.md`, `packages/sdk-python/pyproject.toml`, `packages/sdk-python/README.md`, `packages/sdk-python/telagent_sdk/client.py`, `packages/sdk-python/telagent_sdk/__init__.py`, `packages/sdk-python/tests/test_client.py`, `packages/sdk-python/scripts/run_phase12_python_sdk_quickstart_check.py`, `docs/implementation/phase-12/logs/2026-03-03-p12-sdk-python-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-sdk-python-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-python-sdk-quickstart-check-run.txt`, `docs/implementation/phase-12/manifests/2026-03-03-p12-python-sdk-quickstart-check.json` | 无 | 进入 `TA-P12-006`（Web Console v2.1 运营与应急面板） |
| TA-P12-006 | DONE | `docs/implementation/phase-12/ta-p12-006-web-console-v21-ops-emergency-panel-2026-03-03.md`, `packages/web/src/index.html`, `packages/web/src/main.js`, `packages/web/src/styles.css`, `packages/web/scripts/run-phase12-console-v21-check.mjs`, `docs/implementation/phase-12/logs/2026-03-03-p12-web-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-web-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-web-console-v21-check-run.txt`, `docs/implementation/phase-12/manifests/2026-03-03-p12-web-console-v21-check.json` | 无 | 进入 `TA-P12-007`（多节点密钥轮换编排脚本） |
| TA-P12-007 | DONE | `docs/implementation/phase-12/ta-p12-007-multi-node-key-rotation-orchestrator-2026-03-03.md`, `packages/node/scripts/run-phase12-key-rotation-orchestrator-check.ts`, `packages/node/src/services/key-rotation-orchestrator.test.ts`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-key-rotation-orchestrator-check-run.txt`, `docs/implementation/phase-12/manifests/2026-03-03-p12-key-rotation-orchestrator-check.json` | 无 | 收口证据已提交，见 `TA-P12-008` Gate 结论 |
| TA-P12-008 | DONE | `docs/implementation/phase-12/ta-p12-008-phase12-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-12-gate.md`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-web-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-web-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-sdk-python-build.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-sdk-python-test.txt`, `docs/implementation/phase-12/logs/2026-03-03-p12-gate-manifest-summary.txt` | 无 | Phase 12 已关闭，等待下一阶段规划 |

## 19. Phase 13 v0.2.0 稳定化与可运营增强（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P13-001 | DONE | `docs/implementation/phase-13/ta-p13-001-phase13-boundary-acceptance-2026-03-03.md`, `docs/implementation/phase-13/manifests/2026-03-03-p13-boundary-freeze.json`, `docs/implementation/phase-13/README.md` | 无 | 进入 `TA-P13-002`（规模压测升级） |
| TA-P13-002 | DONE | `docs/implementation/phase-13/ta-p13-002-scale-load-upgrade-2026-03-03.md`, `packages/node/scripts/run-phase13-scale-load-check.ts`, `docs/implementation/phase-13/logs/2026-03-03-p13-scale-load-check-run.txt`, `docs/implementation/phase-13/manifests/2026-03-03-p13-scale-load-check.json` | 无 | 进入 `TA-P13-003`（灾备演练） |
| TA-P13-003 | DONE | `docs/implementation/phase-13/ta-p13-003-dr-backup-restore-drill-2026-03-03.md`, `packages/node/scripts/run-phase13-dr-drill-check.ts`, `docs/implementation/phase-13/logs/2026-03-03-p13-dr-drill-check-run.txt`, `docs/implementation/phase-13/manifests/2026-03-03-p13-dr-drill-check.json` | 无 | 进入 `TA-P13-004`（审计归档验签） |
| TA-P13-004 | DONE | `docs/implementation/phase-13/ta-p13-004-audit-archive-signing-2026-03-03.md`, `packages/node/scripts/run-phase13-audit-archive-check.ts`, `docs/implementation/phase-13/archives/2026-03-03-p13-audit-snapshot-archive.json`, `docs/implementation/phase-13/logs/2026-03-03-p13-audit-archive-check-run.txt`, `docs/implementation/phase-13/manifests/2026-03-03-p13-audit-archive-check.json` | 无 | 进入 `TA-P13-005`（联邦重放保护增强） |
| TA-P13-005 | DONE | `docs/implementation/phase-13/ta-p13-005-federation-circuit-breaker-backoff-2026-03-03.md`, `packages/node/src/services/federation-service.ts`, `packages/node/src/services/federation-service.test.ts`, `packages/node/src/config.ts`, `packages/node/src/config.test.ts`, `packages/node/src/app.ts`, `.env.example`, `packages/node/scripts/run-phase13-federation-protection-check.ts`, `docs/implementation/phase-13/logs/2026-03-03-p13-federation-protection-check-run.txt`, `docs/implementation/phase-13/manifests/2026-03-03-p13-federation-protection-check.json` | 无 | 进入 `TA-P13-006`（SDK 一致性校验） |
| TA-P13-006 | DONE | `docs/implementation/phase-13/ta-p13-006-sdk-ts-python-parity-2026-03-03.md`, `packages/node/scripts/run-phase13-sdk-parity-check.ts`, `packages/sdk/src/index.ts`, `packages/sdk-python/telagent_sdk/client.py`, `docs/implementation/phase-13/logs/2026-03-03-p13-sdk-parity-check-run.txt`, `docs/implementation/phase-13/manifests/2026-03-03-p13-sdk-parity-check.json` | 无 | 进入 `TA-P13-007`（Gate 收口） |
| TA-P13-007 | DONE | `docs/implementation/phase-13/ta-p13-007-phase13-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-13-gate.md`, `docs/implementation/phase-13/logs/2026-03-03-p13-node-build.txt`, `docs/implementation/phase-13/logs/2026-03-03-p13-node-test.txt`, `docs/implementation/phase-13/logs/2026-03-03-p13-gate-manifest-summary.txt` | 无 | Phase 13 已关闭（Gate=PASS），进入 Phase 14 产品聚焦执行 |

## 20. Phase 14 产品聚焦与缺陷收敛（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P14-001 | DONE | `docs/implementation/phase-14/ta-p14-001-phase14-product-focus-boundary-2026-03-03.md`, `docs/implementation/phase-14/README.md` | 无 | 进入 `TA-P14-002`（删除默认 Web 运维面板） |
| TA-P14-002 | DONE | `docs/implementation/phase-14/ta-p14-002-web-ops-panel-removal-2026-03-03.md`, `packages/web/src/index.html`, `packages/web/src/main.js` | 无 | 进入 `TA-P14-003`（消息拉取稳定游标改造） |
| TA-P14-003 | DONE | `docs/implementation/phase-14/ta-p14-003-stable-pull-cursor-2026-03-03.md`, `packages/node/src/services/message-service.ts`, `packages/node/src/storage/message-repository.ts`, `packages/node/src/storage/postgres-message-repository.ts`, `packages/node/src/services/message-service.test.ts`, `packages/node/src/phase4-e2e.test.ts`, `packages/node/scripts/run-phase14-stable-pull-cursor-check.ts`, `docs/implementation/phase-14/logs/2026-03-03-p14-node-build.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-node-test.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-stable-pull-cursor-check-run.txt`, `docs/implementation/phase-14/manifests/2026-03-03-p14-stable-pull-cursor-check.json` | 无 | 进入 `TA-P14-004`（direct 会话参与方访问控制） |
| TA-P14-004 | DONE | `docs/implementation/phase-14/ta-p14-004-direct-session-acl-2026-03-03.md`, `packages/node/src/services/message-service.ts`, `packages/node/src/storage/message-repository.ts`, `packages/node/src/storage/postgres-message-repository.ts`, `packages/node/src/services/message-service.test.ts`, `packages/node/src/phase4-e2e.test.ts`, `packages/node/scripts/run-phase14-direct-session-acl-check.ts`, `docs/implementation/phase-14/logs/2026-03-03-p14-node-build-ta-p14-004.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-node-test-ta-p14-004.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-direct-session-acl-check-run.txt`, `docs/implementation/phase-14/manifests/2026-03-03-p14-direct-session-acl-check.json` | 无 | 进入 `TA-P14-005`（TS/Python SDK 行为收敛） |
| TA-P14-005 | DONE | `docs/implementation/phase-14/ta-p14-005-sdk-parity-and-error-semantics-2026-03-03.md`, `packages/sdk/src/index.test.ts`, `packages/sdk-python/telagent_sdk/client.py`, `packages/sdk-python/tests/test_client.py`, `packages/node/scripts/run-phase14-sdk-parity-check.ts`, `docs/implementation/phase-14/logs/2026-03-03-p14-sdk-ts-test.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-sdk-python-test.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-sdk-parity-check-run.txt`, `docs/implementation/phase-14/manifests/2026-03-03-p14-sdk-parity-check.json` | 无 | 进入 `TA-P14-006`（Phase 14 Gate 收口） |
| TA-P14-006 | DONE | `docs/implementation/phase-14/ta-p14-006-phase14-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-14-gate.md`, `docs/implementation/phase-14/logs/2026-03-03-p14-gate-web-build.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-gate-node-build.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-gate-node-test.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-gate-sdk-ts-test.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-gate-sdk-python-test.txt`, `docs/implementation/phase-14/logs/2026-03-03-p14-gate-manifest-summary.txt` | 无 | Phase 14 已关闭（PASS），进入 Phase 15 执行准备 |

## 21. Phase 15 Web App 工业级设计与多平台建设（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P15-001 | DONE | `docs/implementation/phase-15/ta-p15-001-webapp-industrial-program-2026-03-03.md`, `docs/implementation/phase-15/README.md` | 无 | 进入 `TA-P15-002`（功能域与 IA 设计） |
| TA-P15-002 | DONE | `docs/implementation/phase-15/ta-p15-002-webapp-functional-ia-freeze-2026-03-03.md`, `docs/implementation/phase-15/README.md`, `docs/implementation/phase-15/logs/2026-03-03-p15-node-build.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-node-test.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-functional-ia-check-run.txt`, `docs/implementation/phase-15/manifests/2026-03-03-p15-functional-ia-check.json` | 无 | 进入 `TA-P15-003`（设计系统与组件规范） |
| TA-P15-003 | DONE | `docs/implementation/phase-15/ta-p15-003-webapp-design-system-and-component-spec-2026-03-03.md`, `docs/implementation/phase-15/README.md`, `docs/implementation/phase-15/logs/2026-03-03-p15-web-build.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-web-test.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-design-system-check-run.txt`, `docs/implementation/phase-15/manifests/2026-03-03-p15-design-system-check.json` | 无 | 进入 `TA-P15-004`（多平台架构与共享核心层设计） |
| TA-P15-004 | DONE | `docs/implementation/phase-15/ta-p15-004-webapp-multi-platform-architecture-2026-03-03.md`, `docs/implementation/phase-15/README.md`, `docs/implementation/phase-15/logs/2026-03-03-p15-web-build-ta-p15-004.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-web-test-ta-p15-004.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-platform-architecture-check-run.txt`, `docs/implementation/phase-15/manifests/2026-03-03-p15-platform-architecture-check.json` | 无 | 进入 `TA-P15-005`（离线同步、冲突策略与性能预算） |
| TA-P15-005 | DONE | `docs/implementation/phase-15/ta-p15-005-webapp-offline-sync-conflict-performance-2026-03-03.md`, `docs/implementation/phase-15/README.md`, `docs/implementation/phase-15/logs/2026-03-03-p15-web-build-ta-p15-005.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-web-test-ta-p15-005.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-offline-sync-check-run.txt`, `docs/implementation/phase-15/manifests/2026-03-03-p15-offline-sync-check.json` | 无 | 进入 `TA-P15-006`（客户端质量体系与发布门禁） |
| TA-P15-006 | DONE | `docs/implementation/phase-15/ta-p15-006-webapp-quality-gates-and-release-readiness-2026-03-03.md`, `docs/implementation/phase-15/README.md`, `docs/implementation/phase-15/logs/2026-03-03-p15-web-build-ta-p15-006.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-web-test-ta-p15-006.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-node-build-ta-p15-006.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-node-test-ta-p15-006.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-sdk-ts-test-ta-p15-006.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-sdk-python-test-ta-p15-006.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-quality-gates-check-run.txt`, `docs/implementation/phase-15/manifests/2026-03-03-p15-quality-gates-check.json` | 无 | 进入 `TA-P15-007`（Phase 15 Gate 评审与收口） |
| TA-P15-007 | DONE | `docs/implementation/phase-15/ta-p15-007-phase15-gate-review-2026-03-03.md`, `docs/implementation/gates/phase-15-gate.md`, `docs/implementation/phase-15/logs/2026-03-03-p15-gate-web-build.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-gate-web-test.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-gate-node-build.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-gate-node-test.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-gate-sdk-ts-test.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-gate-sdk-python-test.txt`, `docs/implementation/phase-15/logs/2026-03-03-p15-gate-manifest-summary.txt` | 无 | Phase 15 已关闭（PASS），进入 Phase 16 实装冲刺 |

## 22. Phase 16 Web App 实装冲刺（2026-03-03）

| Task ID | 状态 | 证据链接 | 阻塞项 | 下一步动作 |
| --- | --- | --- | --- | --- |
| TA-P16-001 | DONE（SUPERSEDED） | `docs/implementation/phase-16/ta-p16-001-web-app-runtime-shell-and-api-client-2026-03-03.md`, `docs/implementation/phase-16/README.md` | 无 | 该 JS 原型已被 `TA-P16-004` 技术栈重规划替代 |
| TA-P16-002 | DONE（SUPERSEDED） | `docs/implementation/phase-16/ta-p16-002-sessions-domain-stability-retry-2026-03-03.md`, `docs/implementation/phase-16/README.md` | 无 | 该 JS 原型增强已被 `TA-P16-004` 技术栈重规划替代 |
| TA-P16-003 | DONE（SUPERSEDED） | `docs/implementation/phase-16/ta-p16-003-groups-domain-validation-chain-state-linkage-2026-03-03.md`, `docs/implementation/phase-16/README.md` | 无 | 该 JS 原型增强已被 `TA-P16-004` 技术栈重规划替代 |
| TA-P16-004 | DONE | `docs/implementation/phase-16/ta-p16-004-webapp-ts-react-vite-rebaseline-2026-03-03.md`, `docs/implementation/phase-16/README.md`, `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.tsx`, `packages/web/src/App.tsx`, `packages/web/src/core/api-client.ts`, `packages/web/src/core/session-domain.ts`, `packages/web/src/core/group-domain.ts`, `packages/web/src/core/api-client.test.ts`, `packages/web/src/core/session-domain.test.ts`, `packages/web/src/core/group-domain.test.ts`, `packages/web/scripts/run-phase16-ts-framework-check.mjs`, `docs/implementation/phase-16/logs/2026-03-03-p16-web-typecheck-ta-p16-004.txt`, `docs/implementation/phase-16/logs/2026-03-03-p16-web-build-ta-p16-004.txt`, `docs/implementation/phase-16/logs/2026-03-03-p16-web-test-ta-p16-004.txt`, `docs/implementation/phase-16/logs/2026-03-03-p16-ts-framework-check-run.txt`, `docs/implementation/phase-16/manifests/2026-03-03-p16-ts-framework-check.json` | 无 | 进入 `TA-P16-005`（TS 基线下的身份与节点诊断增强） |
| TA-P16-005 | TODO | `docs/implementation/phase-16/README.md` | 无 | 实施身份与节点诊断增强并补齐测试/证据 |
| TA-P16-006 | TODO | `docs/implementation/phase-16/README.md` | 无 | 进行质量收口与发布前检查 |
| TA-P16-007 | TODO | `docs/implementation/phase-16/README.md` | 无 | Gate 评审与阶段收口 |
