# TA-P12-001 Phase 12 候选池冻结（2026-03-03）

- Task ID：TA-P12-001
- 阶段：Phase 12（v1.2 候选能力冻结与排期）
- 状态：DONE
- 负责人角色：TL + BE + Security + SRE + QA + FE + DX

## 1. 目标

在 Phase 11 于 2026-03-03 通过 Gate 后，立即冻结 Phase 12 候选池，明确：

1. 候选能力边界与优先级（MUST/SHOULD/COULD）；
2. 每个候选项的最小验收标准；
3. 下一轮执行入口任务与 Gate 路径。

## 2. 冻结范围

本次冻结不改变既有强约束，只定义下一阶段候选能力：

- API 前缀仍仅允许 `/api/v1/*`
- DID 规则仍仅允许 `did:claw:*`
- DID hash 仍固定 `keccak256(utf8(did))`
- 错误响应仍为 RFC7807（`application/problem+json`）
- Gas 模型仍为用户自付（不引入 relayer/paymaster）

## 3. 候选池（已冻结）

### MUST（本阶段优先）

1. `TA-P12-002`：链上/链下审计快照导出（脱敏）
2. `TA-P12-003`：revoked DID 实时会话隔离（订阅+驱逐）
3. `TA-P12-004`：联邦 SLO 自动化（DLQ 自动重放 + burn-rate 告警）

### SHOULD（资源允许时纳入）

4. `TA-P12-005`：Agent SDK Python Beta
5. `TA-P12-006`：Web Console v2.1 运营与应急面板

### COULD（可选）

6. `TA-P12-007`：多节点密钥轮换编排脚本

## 4. 执行策略

1. 先做 `TA-P12-002`（审计能力）作为后续可观测基线；
2. 再做 `TA-P12-003`（身份撤销实时隔离）收口安全闭环；
3. `TA-P12-004` 并行推进运维自动化；
4. 最后执行 `TA-P12-008` Gate 收口。

## 5. 证据

- 候选池清单（机读）：`docs/implementation/phase-12/manifests/2026-03-03-p12-candidate-pool-freeze.json`
- Phase 12 索引：`docs/implementation/phase-12/README.md`
- WBS 更新：`docs/implementation/telagent-v1-task-breakdown.md`
- 迭代看板更新：`docs/implementation/telagent-v1-iteration-board.md`

## 6. 结论

- `TA-P12-001`：PASS
- Phase 12 候选池已冻结，可直接进入 `TA-P12-002` 设计与实现。
