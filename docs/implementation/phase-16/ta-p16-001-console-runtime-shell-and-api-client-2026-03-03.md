# TA-P16-001 Console 路由化壳层与统一 API Client 落地（2026-03-03）

- Task ID：TA-P16-001
- 阶段：Phase 16
- 状态：DONE
- 负责人角色：Frontend + QA

## 1. 目标

在 `packages/console` 启动第一批真实实现，替换原占位式页面与测试，形成可演进的 Console 运行时基线：

1. 路由化界面壳层（sessions/groups/identity/settings）；
2. 统一 API 客户端，强制 `/api/v1/*` 前缀；
3. DID 输入仅接受 `did:claw:*`；
4. RFC7807（`application/problem+json`）错误映射为统一异常对象；
5. Console 包拥有可执行单测（非占位测试脚本）。

## 2. 实现摘要

1. 新增 `TelagentApiClient`：
   - 内置 `/api/v1/*` 路径前缀断言；
   - 内置 DID 格式校验（`did:claw:*`）；
   - 内置 RFC7807 错误解析（`ApiProblemError`）；
   - 提供 `getSelfIdentity/pullMessages/sendMessage/createGroup/inviteMember/acceptInvite/resolveIdentity/getNodeInfo` 等方法。
2. 重构 Console 主入口：
   - 统一由 `#app` 挂载；
   - 会话、群组、身份、设置四个路由视图；
   - API 调用结果与错误统一进入 Inspector/Activity 日志。
3. 重构样式：
   - 引入三栏壳层布局与移动端断点；
   - 提供会话列表、消息时间线、响应面板等基础视觉结构。
4. 替换 Console 测试基线：
   - `@telagent/console` 从占位 `echo` 测试切到 `node --test`；
   - 新增 API 客户端专项单测，覆盖前缀约束、DID 校验、RFC7807 解析、数据提取等行为。

## 3. 变更文件

- `packages/console/src/core/api-client.js`
- `packages/console/src/main.js`
- `packages/console/src/index.html`
- `packages/console/src/styles.css`
- `packages/console/test/api-client.test.js`
- `packages/console/package.json`
- `packages/console/scripts/run-phase16-console-runtime-shell-check.mjs`

## 4. 验证

1. 构建：
   - `corepack pnpm --filter @telagent/console build`
2. 测试：
   - `corepack pnpm --filter @telagent/console test`
3. 专项脚本：
   - `node packages/console/scripts/run-phase16-console-runtime-shell-check.mjs`

## 5. 证据

- 构建日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-build.txt`
- 测试日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-test.txt`
- 专项检查日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-runtime-shell-check-run.txt`
- 机读清单：`docs/implementation/phase-16/manifests/2026-03-03-p16-console-runtime-shell-check.json`
