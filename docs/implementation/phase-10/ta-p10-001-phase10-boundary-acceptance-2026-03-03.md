# TA-P10-001 Phase 10 边界与验收标准冻结（2026-03-03）

- Task ID：TA-P10-001
- 阶段：Phase 10（联邦灰度发布自动化与应急回滚编排）
- 状态：DONE
- 负责人角色：TL / BE / SRE / QA

## 1. 目标

收口 Phase 9 Gate 中 Accepted 风险（灰度发布窗口缺少自动化编排与一键回滚剧本），冻结 Phase 10 的实施边界与验收标准。

## 2. 范围

1. 提供联邦协议升级灰度发布自动化编排脚本，输出机读清单（manifest）。
2. 灰度编排必须覆盖 canary/wave2/wave3 三阶段，并验证节点覆盖完整性。
3. 提供回滚演练脚本，模拟 rollout->rollback 行为并验证兼容关系恢复。
4. 所有阶段证据归档到 `docs/implementation/phase-10/` 并完成 Gate 收口。

## 3. 验收标准

1. `TA-P10-002`：灰度发布自动化脚本 `decision=PASS`，`uniqueCoveredNodes=totalNodes`。
2. `TA-P10-003`：回滚演练脚本 `decision=PASS`，且 `rollbackStepsPrepared=true`。
3. `TA-P10-004`：Gate 文档结论 `PASS`，并关闭 Phase 9 Accepted 风险项。

## 4. 实施约束

- API 路径仍仅允许 `/api/v1/*`。
- 错误响应仍必须 RFC7807（`application/problem+json`）。
- DID 与 hash 规则保持不变（`did:claw:*`，`keccak256(utf8(did))`）。
- 自动化脚本只做运维编排校验，不改变协议兼容校验语义。

## 5. 下一步

进入 `TA-P10-002`：落地联邦灰度发布自动化编排与清单输出。
