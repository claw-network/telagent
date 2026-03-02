# TelAgent v1 任务拆解（WBS）

- 文档版本：v1.0
- 最后更新：2026-03-02
- 目标：把实施计划落地为可执行、可跟踪、可验收的任务清单

## 1. 使用说明

- **执行顺序**：按 `Phase 0 -> Phase 5` 串行推进，禁止跨 Gate 跳阶段。
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

| TA-P1-001 | Phase 1 | 合约接口审查与签字 | Chain Engineer | 0.5 | TA-P0-004, TA-P0-005 | 接口审查记录 | 函数签名冻结 | TODO |
| TA-P1-002 | Phase 1 | 实现 `TelagentGroupRegistry` 核心存储/校验 | Chain Engineer | 2 | TA-P1-001 | 合约代码 | 核心流程可编译部署 | TODO |
| TA-P1-003 | Phase 1 | 实现权限约束（active/controller/owner） | Chain Engineer | 1 | TA-P1-002 | 合约逻辑补齐 | 非法调用全部回退 | TODO |
| TA-P1-004 | Phase 1 | 实现事件模型（可重建成员集） | Chain Engineer | 1 | TA-P1-002 | 事件定义 | 事件字段满足重建需求 | TODO |
| TA-P1-005 | Phase 1 | 编写合约单元测试：正向流程 | QA + Chain Engineer | 1.5 | TA-P1-003, TA-P1-004 | 合约测试用例 | create/invite/accept/remove 全绿 | TODO |
| TA-P1-006 | Phase 1 | 编写合约单元测试：异常流程 | QA + Chain Engineer | 1.5 | TA-P1-003 | 合约测试用例 | 非 controller / revoked / 重复操作全绿 | TODO |
| TA-P1-007 | Phase 1 | 编写部署脚本（local/testnet） | Chain Engineer | 1 | TA-P1-002 | deploy script | 可重复部署且输出地址 | TODO |
| TA-P1-008 | Phase 1 | 编写回滚脚本与 Runbook | Chain Engineer | 1 | TA-P1-007 | rollback script + runbook | 在测试网完成回滚演练 | TODO |
| TA-P1-009 | Phase 1 | 产出 ABI 与地址清单 | Chain Engineer | 0.5 | TA-P1-007 | ABI/manifest | 下游可直接集成调用 | TODO |
| TA-P1-010 | Phase 1 | （可选）注册 ClawRouter 模块 | Chain Engineer | 0.5 | TA-P1-009 | router 注册脚本 | 模块查询可见 | TODO |
| TA-P1-011 | Phase 1 | 合约阶段 Gate 评审 | PM/Tech Lead | 0.5 | TA-P1-005, TA-P1-006, TA-P1-008 | Gate 结论 | Phase 1 正式关闭 | TODO |

| TA-P2-001 | Phase 2 | 搭建 API Server 与路由挂载 | Backend Engineer | 1 | TA-P0-001 | API 框架代码 | 所有核心路由在 `/api/v1/*` | TODO |
| TA-P2-002 | Phase 2 | 实现响应封装（单资源/列表/Location） | Backend Engineer | 1 | TA-P0-002, TA-P2-001 | response 模块 | 契约测试通过 | TODO |
| TA-P2-003 | Phase 2 | 实现 RFC7807 错误处理链路 | Backend Engineer | 1 | TA-P0-003, TA-P2-001 | error/handler 模块 | 错误响应字段完整 | TODO |
| TA-P2-004 | Phase 2 | 实现 IdentityAdapterService | Backend Engineer | 1 | TA-P0-004, TA-P1-009 | 身份适配服务 | active/controller 校验可用 | TODO |
| TA-P2-005 | Phase 2 | 实现 GasService 与余额预检 | Backend Engineer | 1 | TA-P2-004 | gas 预检服务 | 余额不足返回标准错误 | TODO |
| TA-P2-006 | Phase 2 | 实现 GroupService 链上写流程 | Backend Engineer | 2 | TA-P2-004, TA-P2-005 | group service | create/invite/accept/remove 可执行 | TODO |
| TA-P2-007 | Phase 2 | 实现 `identities*` 与 `groups*` API | Backend Engineer | 1.5 | TA-P2-006 | route handlers | 所有必选接口可访问 | TODO |
| TA-P2-008 | Phase 2 | 实现 messages/attachments/federation API 骨架 | Backend Engineer | 2 | TA-P2-002, TA-P2-003 | route handlers | 基础请求可收发 | TODO |
| TA-P2-009 | Phase 2 | API 契约测试（路径+envelope+错误） | QA Engineer | 1.5 | TA-P2-007, TA-P2-008 | API test suite | 契约测试全绿 | TODO |
| TA-P2-010 | Phase 2 | 集成测试（真实 ClawIdentity + 测试链） | QA + Backend | 2 | TA-P2-006, TA-P1-009 | integration tests | 建群到成员变更闭环通过 | TODO |
| TA-P2-011 | Phase 2 | Node API 阶段 Gate 评审 | PM/Tech Lead | 0.5 | TA-P2-009, TA-P2-010 | Gate 结论 | Phase 2 正式关闭 | TODO |

| TA-P3-001 | Phase 3 | 设计并创建索引存储表结构 | Backend Engineer | 1 | TA-P2-006 | DB schema | `groups/group_members/group_events` 就绪 | TODO |
| TA-P3-002 | Phase 3 | 实现 GroupIndexer 事件订阅与解码 | Backend Engineer | 2 | TA-P1-009, TA-P3-001 | indexer service | 事件可持续入库 | TODO |
| TA-P3-003 | Phase 3 | 实现 pending/finalized 双视图查询 | Backend Engineer | 1.5 | TA-P3-002 | 查询逻辑/API | 同一群可切换两种视图 | TODO |
| TA-P3-004 | Phase 3 | 实现 finalityDepth 处理逻辑 | Backend Engineer | 1 | TA-P3-002 | finality 逻辑 | 仅确认后写 finalized | TODO |
| TA-P3-005 | Phase 3 | 实现 reorg 检测与回滚重放 | Backend Engineer | 2 | TA-P3-004 | rollback/replay 逻辑 | 重组后状态可一致恢复 | TODO |
| TA-P3-006 | Phase 3 | 编写 reorg 注入测试 | QA Engineer | 1.5 | TA-P3-005 | reorg tests | 注入测试全绿 | TODO |
| TA-P3-007 | Phase 3 | 一致性巡检脚本（链上 vs 读模型） | Backend Engineer | 1 | TA-P3-003, TA-P3-005 | consistency checker | 巡检误差率为 0 | TODO |
| TA-P3-008 | Phase 3 | Indexer 阶段 Gate 评审 | PM/Tech Lead | 0.5 | TA-P3-006, TA-P3-007 | Gate 结论 | Phase 3 正式关闭 | TODO |

| TA-P4-001 | Phase 4 | Signal/MLS 适配层接口冻结 | Protocol Owner | 1 | TA-P0-005 | 协议接口文档 | 参数与状态机一致 | TODO |
| TA-P4-002 | Phase 4 | 实现 Envelope 序号生成与单调保障 | Backend Engineer | 1 | TA-P4-001 | seq allocator | 会话内 seq 单调递增 | TODO |
| TA-P4-003 | Phase 4 | 实现 Envelope 去重与幂等写入 | Backend Engineer | 1 | TA-P4-002 | dedupe store | 重复 envelope 不重复投递 | TODO |
| TA-P4-004 | Phase 4 | 实现离线邮箱 TTL 清理任务 | Backend Engineer | 1 | TA-P4-003 | mailbox cleaner | 超时消息按策略清理 | TODO |
| TA-P4-005 | Phase 4 | 实现 provisional 消息标记/剔除逻辑 | Backend Engineer | 1.5 | TA-P3-005, TA-P4-003 | provisional handler | 失败/reorg 后可剔除 | TODO |
| TA-P4-006 | Phase 4 | 实现附件 init/complete 与清单校验 | Backend Engineer | 1.5 | TA-P2-008 | attachment service | 50MB 限制与校验生效 | TODO |
| TA-P4-007 | Phase 4 | 实现联邦接口鉴权/限流/重试 | Security + Backend | 2 | TA-P2-008 | federation hardening | 恶意重放与洪泛可控 | TODO |
| TA-P4-008 | Phase 4 | 实现 node-info 域名一致性校验 | Security Engineer | 1 | TA-P0-006, TA-P4-007 | domain verify logic | 域名与节点声明一致 | TODO |
| TA-P4-009 | Phase 4 | E2E：A 建群 -> 邀请 B -> B 接受 -> 群聊 | QA Engineer | 2 | TA-P4-005, TA-P4-006 | E2E suite | 主链路全绿 | TODO |
| TA-P4-010 | Phase 4 | E2E：离线 24h 拉取 + 去重排序 | QA Engineer | 1.5 | TA-P4-004, TA-P4-009 | E2E suite | 离线场景稳定通过 | TODO |
| TA-P4-011 | Phase 4 | 压测（<=500 成员群） | SRE + QA | 2 | TA-P4-009 | 压测报告 | 核心 SLO 达到目标 | TODO |
| TA-P4-012 | Phase 4 | 消息通道阶段 Gate 评审 | PM/Tech Lead | 0.5 | TA-P4-010, TA-P4-011 | Gate 结论 | Phase 4 正式关闭 | TODO |

| TA-P5-001 | Phase 5 | Web 管理台打通建群/邀请/接受/聊天 | Frontend Engineer | 2 | TA-P4-009 | Web 功能闭环 | 全流程可操作可演示 | TODO |
| TA-P5-002 | Phase 5 | 监控面板与告警规则落地 | SRE/DevOps | 1.5 | TA-P4-011 | Dashboard + Alert | 指标/告警可用 | TODO |
| TA-P5-003 | Phase 5 | 故障注入演练（链拥堵/reorg/联邦故障） | QA + SRE | 1.5 | TA-P5-002 | 演练报告 | 演练项全部可恢复 | TODO |
| TA-P5-004 | Phase 5 | 安全评审与上线检查清单 | Security Engineer | 1 | TA-P5-003 | Security checklist | 高危风险清零 | TODO |
| TA-P5-005 | Phase 5 | 发布 Readiness 报告（Go/No-Go） | PM/Tech Lead | 1 | TA-P5-001, TA-P5-004 | readiness report | 审批通过可发布 | TODO |
| TA-P5-006 | Phase 5 | MVP 验收签字与版本冻结 | PM/Tech Lead | 0.5 | TA-P5-005 | 验收记录 | Phase 5 正式关闭 | TODO |

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
| TA-P0-007 | DONE | `docs/implementation/phase-0/ta-p0-007-test-strategy.md`, `docs/implementation/phase-0/day1-baseline-check.md` | npm registry 网络不可达导致 Day 1 本地 build/test 未完成 | 网络恢复后补跑 `pnpm install && pnpm -r build && pnpm -r test` 并归档日志 |
| TA-P0-008 | DONE | `docs/implementation/phase-0/ta-p0-008-gate-mechanism.md`, `docs/implementation/gates/phase-0-gate.md` | Gate 实名签字待补齐 | 2026-03-08 Gate 复核时补齐实名并关闭补丁项 |
