# TA-P14-002 删除 Web 运维面板，保留核心聊天流程（2026-03-03）

- Task ID：TA-P14-002
- 阶段：Phase 14
- 状态：DONE
- 负责人角色：Frontend

## 1. 目标

将默认 Console 从“运维控制台”回归“核心聊天流程入口”，降低信息噪音，聚焦业务主链路。

## 2. 变更

1. 删除页面中的运维相关区块（监控、联邦 DLQ、审计/风险面板）。
2. 重写前端脚本，仅保留核心流程：
   - 查询自身身份
   - 建群 / 邀请 / 接受
   - 发消息 / 拉消息
   - Happy Path 一键执行
3. 保持 API 强约束不变：所有调用仍为 `/api/v1/*`。

## 3. 变更文件

- `packages/web/src/index.html`
- `packages/web/src/main.js`

## 4. 验证

- `corepack pnpm --filter @telagent/console build` 通过。
- 专项检查通过：`docs/implementation/phase-14/logs/2026-03-03-p14-console-ops-removal-check.txt`

## 5. 说明

- 运维能力未从后端 API 删除，仅从默认 Console 界面移除。
- 后续若需要运维控制台，将在独立管理端或 Phase 15 工程中重新定义。

## 6. 证据

- 构建日志：`docs/implementation/phase-14/logs/2026-03-03-p14-console-build.txt`
- 专项检查日志：`docs/implementation/phase-14/logs/2026-03-03-p14-console-ops-removal-check.txt`
- 机读清单：`docs/implementation/phase-14/manifests/2026-03-03-p14-console-ops-removal-check.json`
