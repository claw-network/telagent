# TA-P8-002 联邦 group-state 版本防回退与 split-brain 检测（2026-03-03）

- Task ID：TA-P8-002
- 阶段：Phase 8（联邦韧性与可观测增强）
- 状态：DONE
- 负责人角色：Backend Engineer / QA

## 1. 目标

为联邦 group-state 同步补齐“异常时序确定性”能力，避免跨 AZ 延迟和脑裂写入造成状态回退或同版本冲突。

## 2. 实现

### 2.1 group-state version 语义

- 变更：`packages/node/src/services/federation-service.ts`
  - `syncGroupState` 新增可选 `stateVersion`（正整数）；
  - 对无 `stateVersion` 请求保持兼容（自动版本推进）；
  - 返回值新增 `stateVersion` 便于上游收敛。

### 2.2 冲突检测策略

- `stale`：当请求 `stateVersion` 小于已知版本时拒绝（`CONFLICT`）。
- `split-brain`：当请求 `stateVersion` 等于已知版本但状态不同，拒绝（`CONFLICT`）。
- 保持幂等：同版本同状态仍视为 dedupe，不重复写入。

### 2.3 可观测增强

- `nodeInfo` 新增 `resilience` 域：
  - `staleGroupStateSyncRejected`
  - `splitBrainGroupStateSyncDetected`
  - `totalGroupStateSyncConflicts`

### 2.4 API 校验补齐

- 变更：`packages/node/src/api/routes/federation.ts`
  - `stateVersion` 提供时必须为 `number`，否则返回 RFC7807 `VALIDATION_ERROR`。

## 3. 测试

- 变更测试：`packages/node/src/services/federation-service.test.ts`
  - 新增 stale 拒绝场景；
  - 新增 split-brain 检测场景；
  - 校验 `nodeInfo.resilience` 计数。
- 变更测试：`packages/node/src/api-contract.test.ts`
  - 新增 `stateVersion` 非 number 的 400 响应断言。

## 4. 证据

- Node 构建：`docs/implementation/phase-8/logs/2026-03-03-p8-node-build.txt`
- Node 测试：`docs/implementation/phase-8/logs/2026-03-03-p8-node-test.txt`
- Workspace 测试：`docs/implementation/phase-8/logs/2026-03-03-p8-workspace-test.txt`

## 5. 结论

- `TA-P8-002`：PASS
- 已形成“版本防回退 + 同版本冲突阻断 + 可观测计数”的最小闭环能力。
