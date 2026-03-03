# Phase 4A 边界与验收基线（2026-03-03）

- 阶段：Phase 4（消息通道）
- 范围：`TA-P4-001` ~ `TA-P4-004`
- 结论：允许进入实现（依赖项已满足，Phase 3 Gate=PASS）

## 1. 输入依据

- `docs/implementation/gates/phase-3-gate.md`（结论：PASS，允许进入 Phase 4）
- `docs/implementation/telagent-v1-task-breakdown.md`
- `docs/implementation/telagent-v1-implementation-plan.md`
- `docs/design/telagent-v1-design.md`

## 2. 任务边界（TA-P4-001 ~ TA-P4-004）

1. `TA-P4-001`：冻结 Signal/MLS 适配层接口（协议层 type/interface，不实现生产加密算法）。
2. `TA-P4-002`：实现会话级 seq 分配器，保证 `conversationId` 内单调递增。
3. `TA-P4-003`：实现 `envelopeId` 去重与幂等写入；重复 envelope 不重复入箱。
4. `TA-P4-004`：实现离线邮箱 TTL 清理任务（含定时清理机制和手动清理入口）。

## 3. 不在本批次范围

- 生产级 Signal / MLS 密钥管理、握手与密钥轮换。
- 联邦安全硬化（`TA-P4-007`）与域名一致性校验（`TA-P4-008`）。
- provisional 失败剔除全链路（`TA-P4-005`）。

## 4. 验收标准

- `TA-P4-001`：协议层暴露 `SignalAdapter` 与 `MlsAdapter` 接口，字段满足消息收发上下文。
- `TA-P4-002`：新增测试验证同会话 seq 单调递增、跨会话独立计数。
- `TA-P4-003`：新增测试验证同 `envelopeId` 幂等、不重复入箱；同 id 不同 payload 返回冲突错误。
- `TA-P4-004`：新增测试验证 TTL 到期消息被清理，清理后 dedupe key 释放；Node 启动后存在定时清理任务。

## 5. 证据计划

- 代码变更：`packages/protocol`、`packages/node`
- 测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
- 构建日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-build.txt`
