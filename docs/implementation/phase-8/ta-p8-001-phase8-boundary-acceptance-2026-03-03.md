# TA-P8-001 Phase 8 边界与验收标准冻结（2026-03-03）

- Task ID：TA-P8-001
- 阶段：Phase 8（联邦韧性与可观测增强）
- 状态：DONE
- 负责人角色：TL / BE / SRE / QA

## 1. 目标

关闭 Phase 7 Gate 中 Accepted 风险（跨可用区复制延迟/脑裂场景未覆盖），补齐联邦 group-state 同步在异常时序下的确定性保障与可观测输出。

## 2. 范围

1. 给 `/api/v1/federation/group-state/sync` 增加可选 `stateVersion` 语义。
2. 在服务端检测并拒绝：
   - `stale`（低于已确认版本）；
   - `split-brain`（同版本不同状态）。
3. 在 `node-info` 暴露冲突计数（stale/split-brain/total）。
4. 提供脚本化场景验证与机读清单，覆盖延迟与脑裂恢复路径。

## 3. 验收标准

1. `TA-P8-002` 代码完成并通过 `@telagent/node` 全量测试。
2. `TA-P8-003` 脚本输出 `decision=PASS`，且场景通过数 `4/4`。
3. Phase 8 Gate 文档给出 `PASS` 结论并更新 WBS/看板状态。

## 4. 实施约束

- API 路径仍然限定 `/api/v1/*`。
- DID 规则仍为 `did:claw:*` 与 `keccak256(utf8(did))`。
- 错误响应仍为 RFC7807（`application/problem+json`）。
- 新增字段仅做向后兼容扩展，不破坏既有请求。

## 5. 下一步

进入 `TA-P8-002`：实现联邦 group-state 版本防回退与 split-brain 检测。
