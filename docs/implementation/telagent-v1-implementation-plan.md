# TelAgent v1 实施计划

- 文档版本：v1.2
- 适用范围：TelAgent MVP（协议后端 + Web 管理台）
- 计划周期：11 周（Phase 0-5）+ 滚动迭代（Phase 6+）
- 最后更新：2026-03-03

## 1. 计划目标

本计划用于把 TelAgent v1 从“规范冻结”推进到“可上线验收”，保证每个阶段都有明确输入、输出、验收门槛和风险控制。

## 2. 实施原则

1. **先规范后编码**：没有冻结的规范，不进入实现。
2. **先链上确定性，再链下体验**：先把群组确权和成员确定性做实，再完善聊天体验。
3. **每阶段可回归**：每个阶段必须有自动化测试和回滚方案。
4. **兼容 ClawNet 基线不可破坏**：DID、hash、API 前缀、响应 envelope、Gas 模型不能偏离。

## 3. 角色与职责

- **Protocol Owner**：协议与类型冻结、错误码治理
- **Chain Engineer**：合约开发、测试、部署、回滚
- **Backend Engineer**：Node API、链适配、索引器、消息服务
- **Security Engineer**：鉴权、联邦安全、威胁建模
- **QA Engineer**：契约测试、集成测试、E2E 与回归
- **SRE/DevOps**：监控、告警、压测、发布流程
- **Frontend Engineer**：Web 管理台流程闭环

## 4. 时间线与里程碑

| 阶段 | 周期 | 里程碑 | Gate 条件 |
| --- | --- | --- | --- |
| Phase 0 | 1 周 | 规范冻结 | RFC、错误码、状态机均签字确认 |
| Phase 1 | 2 周 | 合约可部署 | 测试通过，测试网部署成功，ABI/地址发布 |
| Phase 2 | 2 周 | API + 链适配可用 | `/api/v1/*` 全量打通，gas 预检生效 |
| Phase 3 | 2 周 | 索引器与确定性视图可用 | pending/finalized/reorg 闭环 |
| Phase 4 | 3 周 | 消息通道闭环 | 文本/图片/文件 + 联邦 + 离线拉取 |
| Phase 5 | 1 周 | MVP 验收 | SLO 达标、故障演练通过、readiness 完成 |
| Phase 12 | 滚动 | v1.2 候选池冻结与执行排程 | 候选池冻结完成并进入首个 MUST 任务 |
| Phase 13 | 滚动 | v0.2.0 稳定化与可运营增强 | 压测、灾备、审计归档、联邦重放保护、SDK 一致性全部通过 Gate |
| Phase 14 | 滚动 | 产品聚焦与缺陷收敛 | 默认 Web 界面回归核心聊天流程，关键一致性缺陷进入收敛闭环 |
| Phase 15 | 滚动 | Web App 工业级设计与多平台建设 | 功能域、架构、设计系统、多平台、质量门禁形成完整执行框架 |
| Phase 16 | 滚动 | Web App 实装冲刺（核心交互与质量基线） | 路由化壳层、统一 API 客户端、RFC7807 错误链路、Web 自动化测试基线落地 |

## 5. 分阶段执行细节

## 5.1 Phase 0（规范冻结，1 周）

### 输入

- 产品需求与约束（Identity 复用、群上链、`/api/v1/*`）
- ClawNet 基线参考实现

### 关键工作

1. 冻结 API 路径与版本策略
2. 冻结 success/error envelope 与 RFC7807 映射
3. 冻结 DID hash 与 controller 鉴权规则
4. 输出群状态机 RFC（pending/finalized/reorg）
5. 输出 DomainProofV1 规范

### 交付物

- 设计文档（冻结版）
- 错误码字典
- 协议 schema 与类型定义
- 本实施计划 + WBS

### Exit Criteria

- 所有接口在 `/api/v1/*`
- RFC7807 示例可跑通
- 核心团队评审通过并签字

## 5.2 Phase 1（合约与部署，2 周）

### 关键工作

1. 开发 `TelagentGroupRegistry`（UUPS）
2. 完成权限/重复/非法状态/revoked DID 测试
3. 编写部署与回滚脚本
4. 测试网部署并产出 ABI + 地址清单
5. （可选）注册 ClawRouter 模块键 `keccak256("TELAGENT_GROUP")`

### 交付物

- 合约代码 + 单元测试
- 本地与测试网部署记录
- `deploy-manifest` 与 `rollback-runbook`

### Exit Criteria

- 合约测试全绿
- 非 controller 调用关键函数全部失败
- 事件字段可重建成员集

## 5.3 Phase 2（Node API 与链适配，2 周）

### 关键工作

1. 实现 `/api/v1/identities*`、`/api/v1/groups*`
2. 接入 IdentityAdapter + GasService + GroupService
3. 实现 gas 预检与余额不足标准错误
4. 统一 envelope 与 RFC7807
5. 完成 API 契约测试与基础集成测试

### 交付物

- Node API 可运行服务
- API 契约测试报告
- 错误码覆盖报告

### Exit Criteria

- `/api/v1/*` 路径检查全通过
- 创建/邀请/接受/移除链路可执行
- `INSUFFICIENT_GAS_TOKEN_BALANCE` 可稳定触发

## 5.4 Phase 3（Indexer 与确定性成员视图，2 周）

### 关键工作

1. 订阅合约事件，落库 `groups/group_members/group_events`
2. 实现 pending/finalized 双视图查询
3. 实现 finalityDepth 确认与 reorg 回滚
4. 完成重放恢复与一致性校验

### 交付物

- 可持续运行的 GroupIndexer
- 数据恢复脚本
- reorg 演练报告

### Exit Criteria

- 重组注入后视图可恢复一致
- 成员状态转移符合状态机
- 链状态查询与成员查询一致

## 5.5 Phase 4（消息通道，3 周）

### 关键工作

1. 私聊 Signal、群聊 MLS 接入（MVP 可先适配层）
2. 完成 envelope 去重、有序、离线 TTL
3. 完成附件密文上传编排
4. 完成联邦接口与节点互认
5. 完成 E2E：建群 -> 邀请 -> 接受 -> 聊天闭环

### 交付物

- MessageService/FederationService 稳定版本
- E2E 报告（文本/图片/文件）
- 离线场景验证报告（>=24h）

### Exit Criteria

- 至少一次投递 + 会话内有序成立
- 未确权消息可正确标记/剔除
- 联邦对端不可伪造成员状态

## 5.6 Phase 5（MVP 验收，1 周）

### 关键工作

1. Web 管理台串联全流程
2. 压测与故障注入（链延迟、重试、重组）
3. SLO 评估与告警规则校准
4. 产出 Readiness 报告与 Go/No-Go 决策

### 交付物

- Release Candidate
- SLO 验证报告
- Readiness 报告

### Exit Criteria

- 关键 E2E 全绿
- SLO 达标
- 发布委员会批准上线

## 5.7 Phase 12（候选池冻结与滚动执行）

### 关键工作

1. 冻结候选池（MUST/SHOULD/COULD）与最小验收口径；
2. 明确安全、审计、联邦运维自动化优先级；
3. 建立候选项到 Gate 的依赖路径（`TA-P12-001` -> `TA-P12-008`）。

### 交付物

- 候选池冻结文档与机读清单；
- Phase 12 WBS 与迭代看板更新；
- 首个 MUST 任务启动材料。

### Exit Criteria

- 候选池与优先级完成签字冻结；
- 每个候选项具有可验证的最小验收标准；
- `TA-P12-002` ~ `TA-P12-008` 全部完成并具备可验证证据；
- Phase 12 Gate 结论为 `PASS`，允许进入下一阶段。

## 5.8 Phase 13（v0.2.0 稳定化与可运营增强）

### 关键工作

1. 冻结 Phase 13 边界、验收标准和证据模板（`TA-P13-001`）；
2. 完成规模压测升级（消息 + 会话）并量化吞吐/延迟（`TA-P13-002`）；
3. 完成备份/恢复灾备演练并验证 `RTO/RPO` 与序号连续性（`TA-P13-003`）；
4. 完成审计快照签名归档与离线验签（`TA-P13-004`）；
5. 完成联邦 DLQ 重放保护增强（指数退避 + 熔断 + 恢复窗口）（`TA-P13-005`）；
6. 完成 TypeScript/Python SDK 核心能力一致性校验（`TA-P13-006`）；
7. 完成 Gate 评审与阶段收口（`TA-P13-007`）。

### 交付物

- Phase 13 任务文档与阶段索引（`docs/implementation/phase-13/README.md`）；
- Node 构建/测试日志与专项检查日志；
- 机读 manifests（边界冻结、压测、灾备、审计归档、联邦保护、SDK 一致性）；
- Gate 结论文档（`docs/implementation/gates/phase-13-gate.md`）。

### Exit Criteria

- `TA-P13-001` ~ `TA-P13-007` 全部 `DONE`；
- `manifests` 汇总结论 `failed=0`；
- `@telagent/node` 回归测试通过；
- Phase 13 Gate 结论为 `PASS`。

## 5.9 Phase 14（产品聚焦与缺陷收敛）

### 关键工作

1. 冻结 Phase 14 产品聚焦边界（`TA-P14-001`）；
2. 从默认 Web App 删除运维面板，保留核心聊天流程（`TA-P14-002`）；
3. 推进消息拉取稳定游标改造，修复 offset 光标在清理/撤回后不稳定风险（`TA-P14-003`）；
4. 强化 direct 会话访问控制，限制非参与方写入（`TA-P14-004`）；
5. 收敛 TS/Python SDK 高优先行为差异（`TA-P14-005`）；
6. 完成阶段回归与 Gate 收口（`TA-P14-006`）。

### 交付物

- Phase 14 边界与任务文档（`docs/implementation/phase-14/`）；
- Web 核心流程页面与前端脚本调整；
- 关键缺陷修复测试证据；
- Gate 结论文档（待阶段收口时产出）。

### Exit Criteria

- 默认 Web 界面不再包含运维面板；
- 核心聊天主路径可用（create/invite/accept/send/pull）；
- `TA-P14-003` ~ `TA-P14-005` 验收通过；
- Phase 14 Gate 结论为 `PASS`。

## 5.10 Phase 15（Web App 工业级设计与多平台建设）

### 关键工作

1. 冻结 Web App 工业级规划总纲（`TA-P15-001`）；
2. 定义功能域与信息架构（会话、消息、群组、身份、安全）；
3. 定义设计系统（组件、令牌、主题、可访问性）；
4. 定义多平台架构（Web/PWA/Desktop/Mobile）与共享核心层；
5. 制定离线同步、冲突解决、性能预算与客户端质量门禁；
6. 形成可执行里程碑并进入 Phase 15 实施。

### 交付物

- Phase 15 规划文档（`docs/implementation/phase-15/`）；
- 功能矩阵、平台矩阵、架构蓝图；
- 质量门禁与发布策略草案；
- Phase 15 WBS 与迭代计划。

### Exit Criteria

- 功能/架构/平台/质量四条主线均完成冻结；
- 里程碑定义可直接驱动实现排期；
- 风险项与依赖项完成归档并可追踪；
- Phase 15 启动评审通过。

## 5.11 Phase 16（Web App 实装冲刺）

### 关键工作

1. 完成技术栈纠偏：由 JS 原型切换到 `TypeScript + React + Vite`（`TA-P16-004`）；
2. 落地路由化 Web 壳层（会话/群组/身份/设置）与运行态面板；
3. 落地统一 API Client，强制 `/api/v1/*` 前缀并内建 RFC7807 解析；
4. 在前端输入与 API 层统一 DID 约束（仅 `did:claw:*`）；
5. 在 TS 基线上分批补齐身份、节点诊断、契约回归与质量门禁；
6. 完成 Phase 16 Gate 收口（`TA-P16-007`）。

### 交付物

- Phase 16 任务与证据文档（`docs/implementation/phase-16/`）；
- Web 端 TS 代码基线（`packages/web/src/*` + `packages/web/test/*`）；
- Web 构建/测试日志与专项检查 manifest；
- Phase 16 WBS 与迭代看板同步条目。

### Exit Criteria

- `TA-P16-001` ~ `TA-P16-007` 全部完成并具备可验证证据；
- Web API 调用路径仅使用 `/api/v1/*`；
- DID 输入校验仅接受 `did:claw:*`；
- RFC7807 错误链路可在 Web 侧稳定识别并展示；
- Phase 16 Gate 结论为 `PASS`。

## 6. 质量保障策略

### 6.1 测试金字塔

- **合约测试**：权限、状态机、事件重建
- **API 契约测试**：路径、envelope、RFC7807
- **集成测试**：真实 ClawIdentity + 测试链
- **E2E**：A 建群 -> 邀请 B -> B 接受 -> 聊天

### 6.2 阶段 Gate 规则

- Gate 未通过，不得进入下一阶段
- Gate 失败必须产出 RCA 和补救计划
- 高优先级缺陷（P0/P1）清零后才可放行

## 7. 风险与应对

| 风险 | 影响 | 预警信号 | 应对措施 |
| --- | --- | --- | --- |
| 链确认延迟 | 群状态长时间 pending | 平均确认时长超阈值 | UI 暴露 pending、提升重试与提示 |
| 链重组 | 成员视图反转 | reorg 计数突增 | finalityDepth + 回滚重放 |
| 无 relayer 用户门槛高 | 交易失败率高 | gas 不足错误率高 | preflight 强提示 + 余额接口 |
| 联邦不稳定 | 跨域消息丢失/延迟 | 投递重试堆积 | 重试队列 + 死信 + 限流 |
| 密钥管理复杂 | E2EE 失败 | 解密失败率上升 | 协议适配层 + 回归用例覆盖 |

## 8. 配置与环境策略

- 默认测试环境：`chainId=7625`
- 生产环境：`chainId=7626`
- finalityDepth 默认 12
- 离线邮箱 TTL 默认 30 天
- 附件大小上限默认 50MB

发布分层：

1. Local Dev
2. Shared Testnet
3. Staging（准生产）
4. Production

## 9. 项目治理机制

- 每周一次 Phase Review（30 分钟）
- 每阶段结束必须提交：
  - 交付清单
  - 风险清单
  - 缺陷清单
  - Gate 结论
- 变更控制：任何破坏性改动必须走 ADR（Architecture Decision Record）审批

## 10. 验收总清单（MVP）

1. API 仅 `/api/v1/*`，无例外路径。
2. 成功响应与错误响应格式完全符合规范。
3. 群创建/邀请/接受/移除可全链路执行。
4. pending/finalized/reorg 行为与状态机一致。
5. 文本/图片/文件可在加密通道中收发。
6. 离线 24h 后可拉取并正确去重排序。
7. Gas 不足时不广播交易，返回标准错误。
8. 发布 Readiness 报告通过。
