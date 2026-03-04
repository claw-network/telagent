# TA-P11-009 Console v2 运营能力增强（2026-03-03）

- Task ID：TA-P11-009
- 阶段：Phase 11（v1.1 安全与运营能力增强）
- 状态：DONE
- 负责人角色：Frontend + SRE

## 1. 目标

在现有 Mission Console 基础上补齐 v2 运维视图能力，满足以下目标：

1. 可查看群状态快照（group + chain-state + member 视图）；
2. 提供 rollback 入口（retracted envelopes 审计）；
3. 提供 federation 运营视图（node-info / DLQ / replay）。

## 2. 实现

### 2.1 Node API 补充 rollback 查询入口

- 更新：`packages/node/src/api/routes/messages.ts`
- 新增接口：
  - `GET /api/v1/messages/retracted`
- 功能：
  - 支持 `limit`、`conversation_id` 查询；
  - 返回 `{ data: { items }, links }` envelope；
  - 参数非法时返回 RFC7807。

### 2.2 Console v2 视图升级

- 更新：
  - `packages/console/src/index.html`
  - `packages/console/src/styles.css`
  - `packages/console/src/main.js`
- 新增面板：
  - `Group State & Rollback Entry`
  - `Federation Ops View`
- 新增交互：
  - 群快照：并行拉取 group/members/chain-state，卡片化展示；
  - rollback 审计：读取 `/api/v1/messages/retracted`，展示 reorg 剔除条目；
  - federation 运维：读取 node-info、DLQ 列表，支持 replay 后刷新视图。

### 2.3 契约与路由测试同步

- 更新：
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/src/api-prefix.test.ts`
- 覆盖：
  - `/api/v1/messages/retracted` 路由可达；
  - `/api/v1/*` 前缀约束不回退。

### 2.4 自动化检查脚本

- 新增：`packages/console/scripts/run-phase11-console-v2-check.mjs`
- 校验内容：
  - HTML/JS/CSS 中关键 token 全部存在；
  - 输出机读清单用于 Gate 复核。

## 3. 执行命令

```bash
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
pnpm --filter @telagent/console build
pnpm --filter @telagent/console exec node scripts/run-phase11-console-v2-check.mjs
```

## 4. 证据

- 代码：
  - `packages/node/src/api/routes/messages.ts`
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/src/api-prefix.test.ts`
  - `packages/console/src/index.html`
  - `packages/console/src/styles.css`
  - `packages/console/src/main.js`
  - `packages/console/scripts/run-phase11-console-v2-check.mjs`
- 日志：
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-console-build.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-console-v2-check-run.txt`
- 清单：
  - `docs/implementation/phase-11/manifests/2026-03-03-p11-console-v2-check.json`

## 5. 结论

- `TA-P11-009`：PASS
- Console v2 已具备群状态/rollback 入口/联邦运维视图，满足任务验收目标。
