# TA-P16-004 Console 技术栈重规划（TypeScript + React + Vite）（2026-03-03）

- Task ID：TA-P16-004
- 阶段：Phase 16
- 状态：DONE
- 负责人角色：Frontend + DX + QA

## 1. 背景与目标

根据最新纠偏要求，Phase 16 已完成的 Console JS 方案不再作为后续基线，统一切换为：

1. `TypeScript` 强类型代码基线；
2. `React + Vite` 现代化前端框架与构建链；
3. 维持硬约束：`/api/v1/*` 前缀、`did:claw:*` 校验、RFC7807 错误链路。

## 2. 本次重构摘要

1. 工程链路重建：
   - `@telagent/console` 脚本改为 `vite` / `vitest` / `tsc`；
   - 新增 `tsconfig.json`、`vite.config.ts`、根 `index.html`。
2. 代码迁移为 TS + React：
   - 入口与路由壳层迁移到 `main.tsx` + `App.tsx`；
   - API 客户端、会话域、群组域逻辑迁移为 `.ts` 模块；
   - 原 JS 入口/测试与 phase16 JS 专项脚本移除。
3. 测试基线迁移：
   - Node test runner 切换为 `vitest`；
   - API / session / group 三类 domain 单测迁移为 TS。
4. 专项检查：
   - 新增 `run-phase16-ts-framework-check.mjs`，输出机读清单。

## 3. 影响与兼容说明

1. `packages/console/src/*.js` 主实现已迁移并替换为 `*.ts`/`*.tsx`；
2. `TA-P16-001` ~ `TA-P16-003` 的 JS 版本实现仅保留文档证据，不再作为当前代码基线；
3. 后续 `TA-P16-005` 起所有 Web 任务统一在 TS + React 基线上推进。

## 4. 变更文件

- `packages/console/package.json`
- `packages/console/index.html`
- `packages/console/tsconfig.json`
- `packages/console/vite.config.ts`
- `packages/console/src/main.tsx`
- `packages/console/src/App.tsx`
- `packages/console/src/styles.css`
- `packages/console/src/core/api-client.ts`
- `packages/console/src/core/session-domain.ts`
- `packages/console/src/core/group-domain.ts`
- `packages/console/src/core/api-client.test.ts`
- `packages/console/src/core/session-domain.test.ts`
- `packages/console/src/core/group-domain.test.ts`
- `packages/console/scripts/run-phase16-ts-framework-check.mjs`

## 5. 验证

1. `corepack pnpm --filter @telagent/console typecheck`
2. `corepack pnpm --filter @telagent/console build`
3. `corepack pnpm --filter @telagent/console test`
4. `node packages/console/scripts/run-phase16-ts-framework-check.mjs`

## 6. 证据

- 类型检查日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-typecheck-ta-p16-004.txt`
- 构建日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-build-ta-p16-004.txt`
- 测试日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-test-ta-p16-004.txt`
- 专项检查日志：`docs/implementation/phase-16/logs/2026-03-03-p16-ts-framework-check-run.txt`
- 机读清单：`docs/implementation/phase-16/manifests/2026-03-03-p16-ts-framework-check.json`
