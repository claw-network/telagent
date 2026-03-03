# TelAgent 文档索引

本文档集用于把 TelAgent v1 的需求、架构、实施计划和任务拆解固定下来，确保后续开发按阶段推进、可验收、可追踪。

## 1) 先读这些文档（固定顺序）

1. [TelAgent v1 设计文档](./design/telagent-v1-design.md)
2. [TelAgent v1 实施计划](./implementation/telagent-v1-implementation-plan.md)
3. [TelAgent v1 任务拆解（WBS）](./implementation/telagent-v1-task-breakdown.md)
4. [TelAgent v1 迭代看板（按周排期）](./implementation/telagent-v1-iteration-board.md)
5. [TelAgent v1 Agent 接力启动清单（Day 1）](./implementation/telagent-v1-agent-handoff-day1.md)
6. [Phase 0 规范冻结产出（TA-P0-001 ~ TA-P0-008）](./implementation/phase-0/README.md)
7. [Phase 1 执行产出（TA-P1-*）](./implementation/phase-1/README.md)
8. [Phase 2 执行产出（TA-P2-*）](./implementation/phase-2/README.md)
9. [Phase 3 执行产出（TA-P3-*）](./implementation/phase-3/README.md)
10. [Phase 4 执行产出（TA-P4-*）](./implementation/phase-4/README.md)
11. [Phase 5 执行产出（TA-P5-*）](./implementation/phase-5/README.md)
12. [Phase Gate 模板与记录](./implementation/gates/README.md)
13. [TL 广播模板（给所有 agent）](./implementation/telagent-v1-tl-broadcast-template.md)
14. [发布执行产出（TA-RLS-*）](./implementation/release/README.md)

## 2) 文档用途

- **设计文档**：定义架构、协议、状态机、API 和强约束（不能随意改动）。
- **实施计划**：定义 Phase 0-5 的时间线、里程碑、Gate 与风险应对。
- **任务拆解（WBS）**：定义具体可执行任务（负责人、依赖、预估、验收标准、状态）。
- **迭代看板**：把 WBS 映射到周度执行节奏（日期、owner 建议、周交付、Gate）。
- **接力启动清单**：新 agent 入场当天的执行脚本（角色分派、时序、收口标准）。
- **Phase Gate 记录**：每阶段评审结论与补丁项归档，作为进入下一阶段的依据。
- **TL 广播模板**：TL 面向所有 agent 的统一开工/日更/切阶段通知模板。

## 3) 执行规则

1. 任何开发任务开始前，先确认对应规范已经冻结。
2. 所有任务按 WBS 的依赖顺序执行，不跨 Gate 跳阶段。
3. 每个阶段结束必须提交验收证据（测试报告、部署记录、回滚演练结果）。
4. 若需修改强约束（如 `/api/v1/*`、DID hash 规则），必须走 ADR 审批。

## 4) 当前默认基线

- Identity：ClawNet `did:claw:*` / `ClawIdentity`
- DID Hash：`keccak256(utf8(did))`
- API 前缀：仅 `/api/v1/*`
- 错误模型：RFC7807 + `https://telagent.dev/errors/*`
- Gas 模型：用户自付（无 relayer/paymaster）
