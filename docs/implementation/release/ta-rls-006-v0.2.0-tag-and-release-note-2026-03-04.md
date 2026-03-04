# TA-RLS-006 `v0.2.0` 标签发布与 Release Note（2026-03-04）

- Task ID：TA-RLS-006
- 阶段：Release Execution
- 状态：TODO
- 负责人角色：Release Owner / TL

## 1. 目标

在 `TA-RLS-003/004/005` 通过后，完成 `v0.2.0` 标签发布并将关键证据沉淀为机读清单。

## 2. 脚本入口

- `packages/node/scripts/run-release-v020-tag-record.ts`

## 3. 执行顺序

1. 执行并确认：`TA-RLS-003`（preflight）为 `READY_FOR_TAG`
2. 执行并确认：`TA-RLS-004`（双云门禁）为 `PASS`
3. 执行并确认：`TA-RLS-005`（回滚演练）为 `PASS`
4. 创建并推送标签：

```bash
git tag -a v0.2.0 -m "TelAgent v0.2.0"
git push origin v0.2.0
```

5. 记录标签证据：

```bash
cd /Users/xiasenhai/Workspace/OpenClaw/telagent
corepack pnpm --filter @telagent/node exec tsx scripts/run-release-v020-tag-record.ts
```

## 4. 输出物

- 机读报告：`docs/implementation/release/manifests/2026-03-04-v0.2.0-release-tag.json`
- 发布文档：`docs/implementation/release/ta-rls-006-v0.2.0-tag-and-release-note-2026-03-04.md`

## 5. 验收标准

- 标签 `v0.2.0` 本地与远端均存在
- 脚本输出 `decision == RELEASED`
- 报告中包含 preflight / dual-cloud / rollback 三项证据路径
