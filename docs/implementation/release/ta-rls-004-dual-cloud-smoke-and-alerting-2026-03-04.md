# TA-RLS-004 双云联调门禁与告警基线（2026-03-04）

- Task ID：TA-RLS-004
- 阶段：Release Execution
- 状态：TODO
- 负责人角色：SRE / Backend / QA

## 1. 目标

将 Phase 17 的一次性双云联调升级为发布门禁能力：可重复执行、可量化阈值、可产出机读结果。

## 2. 脚本入口

- `packages/node/scripts/run-release-v020-dual-cloud-smoke-check.ts`

## 3. 执行前提

需先注入双节点联调参数（与 `TA-P17-003` 一致）：

```bash
export TELAGENT_NODE_A_URL="https://alex.telagent.org"
export TELAGENT_NODE_B_URL="https://bess.telagent.org"
export TELAGENT_NODE_A_DOMAIN="alex.telagent.org"
export TELAGENT_NODE_B_DOMAIN="bess.telagent.org"
export TELAGENT_NODE_A_DID="did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn"
export TELAGENT_NODE_B_DID="did:claw:z7ToozkCFGsnkJB5HDub6J7cN5EKAxcr4CHfPiazcLkFw"
```

## 4. 执行命令

```bash
cd /Users/xiasenhai/Workspace/OpenClaw/telagent

# 默认阈值：单向 <= 3000ms，双向总和 <= 5000ms
corepack pnpm --filter @telagent/node exec tsx scripts/run-release-v020-dual-cloud-smoke-check.ts

# 可选阈值
# export TELAGENT_RELEASE_SMOKE_MAX_LATENCY_MS="3000"
# export TELAGENT_RELEASE_SMOKE_MAX_COMBINED_LATENCY_MS="5000"
```

## 5. 输出物

- 机读报告：`docs/implementation/release/manifests/2026-03-04-v0.2.0-dual-cloud-smoke-check.json`
- 原始联调报告：`docs/implementation/phase-17/cross-node-chat-check-report.json`

## 6. 验收标准

- `decision == PASS`
- `nodeAToNodeB.delivered == true`
- `nodeBToNodeA.delivered == true`
- 时延满足阈值约束（单向/合并）

## 7. 后续

- 通过后进入 `TA-RLS-005`（回滚与恢复演练）
