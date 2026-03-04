# TA-RLS-003 `v0.2.0` 发布前置检查（2026-03-04）

- Task ID：TA-RLS-003
- 阶段：Release Execution
- 状态：DONE
- 负责人角色：Release Owner / TL / QA / SRE

## 1. 目标

在创建 `v0.2.0` 标签前，对 Phase 6~17 收口结果进行一次统一前置校验，确保“可发布”而不是“仅可开发完成”。

## 2. 脚本入口

- `packages/node/scripts/run-release-v020-preflight.ts`

## 3. 校验项（脚本内置）

1. `phase-6-gate.md` 到 `phase-17-gate.md` 结论均为 `PASS`
2. `TA-P17-003` 双云联调报告为 `PASS` 且在时效窗口内
3. Phase 17 Node 回归日志 `fail=0`
4. 版本号一致且匹配目标发布版本（默认 `0.2.0`）
5. 目标标签（默认 `v0.2.0`）尚不存在（本地/远端）
6. 工作区无未提交改动（发布前清洁）

## 4. 执行命令

```bash
cd /Users/xiasenhai/Workspace/OpenClaw/telagent

# 默认目标 v0.2.0
corepack pnpm --filter @telagent/node exec tsx scripts/run-release-v020-preflight.ts

# 可选：覆盖参数
# export TELAGENT_RELEASE_VERSION="0.2.0"
# export TELAGENT_RELEASE_TAG="v0.2.0"
# export TELAGENT_CROSS_NODE_MAX_AGE_HOURS="72"
```

## 5. 输出物

- 机读报告：`docs/implementation/release/manifests/2026-03-04-v0.2.0-release-preflight.json`
- 运行日志：`docs/implementation/release/logs/2026-03-04-v0.2.0-release-preflight-run.txt`
- 控制台摘要：`checks x/y PASS`、`decision=READY_FOR_TAG|BLOCKED`

## 6. 执行结果（2026-03-04）

- 结果：`checks=6/6 PASS`
- 决策：`decision=READY_FOR_TAG`
- 关键字段：
  - `release.version=0.2.0`
  - `release.targetTag=v0.2.0`
  - `release.commit=1a3c2f1e46d98c44de2552421e0aaddd3cd36109`

## 7. 验收标准

- 报告 `decision == READY_FOR_TAG`
- 任一校验失败则阻断发版，并回写失败原因到报告

## 8. 后续

- 已进入并完成 `TA-RLS-004`（双云持续联调门禁）
