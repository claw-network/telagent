# TA-P2-009 API 契约测试收口（2026-03-02）

- Task ID：TA-P2-009
- 阶段：Phase 2
- 状态：DONE
- 负责人角色：QA Engineer

## 1. 目标

覆盖 API 路径、成功 envelope、RFC7807 错误响应，并补齐 Phase 2 路由可访问性验证。

## 2. 测试实现

- 契约测试文件：
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/src/api-prefix.test.ts`
- 本次收口新增覆盖：
  - `identities and groups endpoints are accessible with expected status codes`
  - `messages, attachments and federation endpoints are accessible`
- 执行脚本修正：`packages/node/package.json`
  - `test` 改为 `node --test dist/*.test.js dist/**/*.test.js`
  - 确保根目录与子目录测试都会执行

## 3. 执行结果

- 构建日志：`docs/implementation/phase-2/logs/2026-03-02-p2-node-build.txt`
- 测试日志：`docs/implementation/phase-2/logs/2026-03-02-p2-node-test.txt`
- 结果：`9/9` 通过。

## 4. 结论

- 路径前缀：`/api/v1/*` 固定生效
- 成功响应：单资源/列表/Location envelope 正常
- 错误响应：RFC7807 字段与 `application/problem+json` 正常
- Phase 2 API 契约测试达到 Gate 输入要求
