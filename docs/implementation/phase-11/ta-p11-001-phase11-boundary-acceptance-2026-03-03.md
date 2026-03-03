# TA-P11-001 Phase 11 边界与验收标准冻结（2026-03-03）

- Task ID：TA-P11-001
- 阶段：Phase 11（v1.1 安全与运营能力增强）
- 状态：DONE
- 负责人角色：TL / BE / SRE / QA / Security

## 1. 目标

在 Phase 10 收口后，冻结 TelAgent v1.1 的首批增强范围，优先补齐“安全、联邦稳定性、运维自动化、工程基线”四类能力，确保可分批交付且每批可 Gate。

## 2. 范围（Phase 11）

1. 工程基线：Node 运行时与 CI 基线统一（避免 Hardhat/Node 不兼容漂移）。
2. 域名安全：DomainProof 自动挑战与过期轮转机制。
3. 联邦互信：对端证书/公钥 pinning 与轮换策略。
4. 联邦可靠性：投递失败队列（DLQ）与重放工具链。
5. 密钥生命周期：Signal/MLS 设备密钥轮换、撤销与恢复。
6. 身份强约束：revoked DID 触发会话失效与链下隔离。
7. 开发者体验：Agent SDK（TypeScript）首版。
8. 运营控制台：Web Console v2（群状态、回滚入口、联邦视图）。
9. 审计能力：不泄露明文的链上/链下审计快照导出。

## 3. 不在范围

- 不修改既有核心强约束：
  - API 前缀仅 `/api/v1/*`
  - DID 仅 `did:claw:*`
  - DID hash 固定 `keccak256(utf8(did))`
  - 错误响应 RFC7807
- 不引入 relayer/paymaster（仍保持用户自付 gas）。

## 4. Task 切分（Phase 11）

- `TA-P11-001`：边界与验收冻结（本任务）
- `TA-P11-002`：Node Runtime/CI 基线固化
- `TA-P11-003`：DomainProof 自动挑战
- `TA-P11-004`：联邦 pinning 与轮换
- `TA-P11-005`：联邦 DLQ 与重放工具
- `TA-P11-006`：Signal/MLS 密钥生命周期管理
- `TA-P11-007`：revoked DID 会话失效链路
- `TA-P11-008`：Agent SDK（TypeScript）v0
- `TA-P11-009`：Web Console v2 运维能力
- `TA-P11-010`：Phase 11 Gate 收口

## 5. 验收标准

1. 每个任务均有对应设计/实现文档 + 自动化证据（日志或清单）。
2. 每个任务均能映射到可验证指标（功能正确性、安全性、可靠性或可运维性）。
3. `TA-P11-010` Gate 文档结论为 `PASS` 后才允许宣告 Phase 11 关闭。

## 6. 下一步

进入 `TA-P11-002`：先固化 Node/CI 基线，再开展安全与联邦能力增强。
