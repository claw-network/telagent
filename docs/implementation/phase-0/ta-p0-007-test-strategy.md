# TA-P0-007 测试策略冻结（合约/API/集成/E2E）

- Task ID：TA-P0-007
- 负责人角色：QA Engineer
- 状态：DONE
- 冻结日期：2026-03-02

## 1. 目标

将实施计划中的 Exit Criteria 转化为可执行测试矩阵，并定义 Gate 的通过/不通过判据。

## 2. 测试金字塔与职责

| 层级 | 范围 | 核心断言 | Owner |
| --- | --- | --- | --- |
| 合约测试 | `TelagentGroupRegistry` | 权限、状态机、事件可重建 | CE + QA |
| API 契约测试 | `/api/v1/*` | 路径、envelope、RFC7807、错误码 | BE + QA |
| 集成测试 | Node + Identity + 测试链 | create/invite/accept/remove 闭环 | BE + QA |
| E2E 测试 | Web/API/链路 | 建群->邀请->接受->聊天；离线拉取 | QA + FE + BE |

## 3. Phase 0 必测项

1. 路由规范检查：只允许 `/api/v1/*`。
2. 错误响应检查：`application/problem+json` + RFC7807 字段齐全。
3. DID 规则检查：仅 `did:claw:*`，hash 规则为 `keccak256(utf8(did))`。
4. 状态机一致性检查：GroupState 与 MembershipState 转移可由用例覆盖。
5. DomainProofV1 校验检查：字段、过期、域名一致性、hash 一致性。

## 4. Gate 判据（Phase 0）

通过（PASS）必须同时满足：

1. `TA-P0-001 ~ TA-P0-008` 状态全部为 `DONE`。
2. 每个任务至少 1 条证据链接可追溯。
3. Exit Criteria 三项均通过：
   - 所有接口路径固定为 `/api/v1/*`
   - RFC7807 示例可跑通
   - 核心团队评审并签字

条件通过（CONDITIONAL PASS）：

- 主体规范冻结完成，但存在不阻断 Week 2 启动前可关闭的补丁项（必须给 owner 和截止日期）。

失败（FAIL）：

- 强约束冲突未关闭，或关键证据缺失，或 P0/P1 风险未收敛。

## 5. Day 1 基线检查证据

执行结果（2026-03-02）：

- `pnpm install`：失败（`ENOTFOUND registry.npmjs.org`）
- `pnpm -r build`：失败（`node_modules` 缺失导致 `hardhat/tsc` 不可用）
- `pnpm -r test`：失败（`hardhat` 不可用）

结论：该阻塞来自外部网络依赖，不改变 Phase 0 规范冻结结论，但需作为 Gate 补丁项追踪。

## 6. 证据

- 实施计划测试策略：`docs/implementation/telagent-v1-implementation-plan.md`（6.1, 6.2）
- WBS 验收要求：`docs/implementation/telagent-v1-task-breakdown.md`
- Day 1 基线校验日志：`docs/implementation/phase-0/day1-baseline-check.md`
