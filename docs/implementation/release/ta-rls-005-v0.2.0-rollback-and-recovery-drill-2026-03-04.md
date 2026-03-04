# TA-RLS-005 `v0.2.0` 回滚与恢复演练（2026-03-04）

- Task ID：TA-RLS-005
- 阶段：Release Execution
- 状态：TODO
- 负责人角色：SRE / Backend / TL

## 1. 目标

在发布前完成一次“可证明可恢复”的回滚演练，避免仅依赖文档假设。

## 2. 脚本入口

- `packages/node/scripts/run-release-v020-rollback-drill.ts`

## 3. 演练模式

脚本会执行以下步骤：

1. 校验回滚目标 tag（默认 `v0.1.0`）存在
2. 采集两节点回滚前健康快照（`identities/self` + `node-info`）
3. 执行回滚命令（由 `TELAGENT_ROLLBACK_DRILL_COMMAND` 注入）
4. 复跑跨节点联调脚本
5. 采集回滚后健康快照并给出 `PASS/BLOCKED`

## 4. 执行命令

```bash
cd /Users/xiasenhai/Workspace/OpenClaw/telagent

export TELAGENT_NODE_A_URL="https://alex.telagent.org"
export TELAGENT_NODE_B_URL="https://bess.telagent.org"
export TELAGENT_NODE_A_DID="did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn"
export TELAGENT_NODE_B_DID="did:claw:z7ToozkCFGsnkJB5HDub6J7cN5EKAxcr4CHfPiazcLkFw"

# 示例：用你实际回滚命令替换
export TELAGENT_ROLLBACK_TARGET_TAG="v0.1.0"
export TELAGENT_ROLLBACK_DRILL_COMMAND="echo 'replace-with-real-rollback-command'"

corepack pnpm --filter @telagent/node exec tsx scripts/run-release-v020-rollback-drill.ts
```

## 5. 输出物

- 机读报告：`docs/implementation/release/manifests/2026-03-04-v0.2.0-rollback-drill.json`
- 复用联调报告：`docs/implementation/phase-17/cross-node-chat-check-report.json`

## 6. 验收标准

- `decision == PASS`
- 回滚目标 tag 校验通过
- 回滚后跨节点联调仍为 `PASS`
- 回滚前后节点身份与域名快照一致

## 7. 后续

- 通过后进入 `TA-RLS-006`（打 tag 与 Release Note 归档）
