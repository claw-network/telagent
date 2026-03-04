# TA-P16-002 会话域增强（稳定刷新、游标体验、失败重试状态）（2026-03-03）

- Task ID：TA-P16-002
- 阶段：Phase 16
- 状态：DONE
- 负责人角色：Frontend + QA

## 1. 目标

在 Phase 16 既有 Console 运行时基线上，完善会话域关键交互，确保“看得见游标、失败可重试、状态可追踪”：

1. 会话拉取游标与最近拉取状态可视化；
2. 支持 `Refresh From Start`（重置游标 + 重拉）与 `Retry Last Pull`；
3. 消息发送失败可记录并支持 `Retry Last Failed Send`；
4. 相关行为具备可单测的纯逻辑模块与专项检查脚本。

## 2. 实现摘要

1. 新增会话域核心模块 `session-domain.js`：
   - 统一会话运行态结构（pull/send 状态、失败计数、失败载荷）；
   - 消息合并函数按 `envelopeId` 去重并稳定排序；
   - 拉取成功/失败、发送成功/失败、游标重置均提供纯函数更新。
2. `main.js` 接入会话运行态：
   - 每个会话维护独立 runtime；
   - `Pull Next Page`、`Refresh From Start`、`Retry Last Pull`、`Reset Cursor` 按钮落地；
   - 发送失败后保留失败 payload，可通过 `Retry Last Failed Send` 重试。
3. 会话状态可视化：
   - 新增 `Session Runtime Status` 卡片，展示 cursor、last pull/send、失败计数、最近错误。
4. 测试与校验：
   - 新增 `session-domain.test.js`（纯逻辑单测）；
   - 新增 `run-phase16-sessions-domain-check.mjs`（机读校验脚本）。

## 3. 变更文件

- `packages/console/src/core/session-domain.js`
- `packages/console/src/main.js`
- `packages/console/src/styles.css`
- `packages/console/test/session-domain.test.js`
- `packages/console/scripts/run-phase16-sessions-domain-check.mjs`

## 4. 验证

1. 构建：
   - `corepack pnpm --filter @telagent/console build`
2. 测试：
   - `corepack pnpm --filter @telagent/console test`
3. 专项脚本：
   - `node packages/console/scripts/run-phase16-sessions-domain-check.mjs`

## 5. 证据

- 构建日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-build-ta-p16-002.txt`
- 测试日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-test-ta-p16-002.txt`
- 专项检查日志：`docs/implementation/phase-16/logs/2026-03-03-p16-sessions-domain-check-run.txt`
- 机读清单：`docs/implementation/phase-16/manifests/2026-03-03-p16-sessions-domain-check.json`
