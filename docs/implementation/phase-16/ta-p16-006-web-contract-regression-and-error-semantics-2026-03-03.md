# TA-P16-006 Web 契约回归与异常语义测试增强（2026-03-03）

- Task ID：TA-P16-006
- 阶段：Phase 16
- 状态：DONE
- 负责人角色：QA + Frontend

## 1. 目标

在 Web TS 基线上强化契约回归，确保以下约束稳定可验证：

1. API 路径仅允许 `/api/v1/*`；
2. DID 输入仅允许 `did:claw:*`；
3. RFC7807 错误语义在客户端可被稳定识别；
4. 非 RFC7807 错误保持明确 HTTP 失败语义；
5. 形成可重复执行的专项检查产物。

## 2. 实现摘要

1. `api-client.test.ts` 增强回归测试：
   - 新增高层 API 路径断言（所有调用落在 `/api/v1/*`）；
   - 新增 DID 输入前置拒绝测试（resolve/send/create/invite/accept）；
   - 新增 RFC7807 与非 RFC7807 错误行为测试。
2. `api-client.ts` 契约面补齐：
   - 新增 `getNodeMetrics()`，并覆盖 `/api/v1/node/metrics` 路径；
   - 复用既有 `ApiProblemError` 解析链路，不改变协议语义。
3. 新增专项脚本：
   - `run-phase16-web-contract-regression-check.mjs`，产出机读清单。

## 3. 变更文件

- `packages/web/src/core/api-client.ts`
- `packages/web/src/core/api-client.test.ts`
- `packages/web/package.json`
- `packages/web/scripts/run-phase16-web-contract-regression-check.mjs`

## 4. 验证

1. `corepack pnpm --filter @telagent/web test`
2. `node packages/web/scripts/run-phase16-web-contract-regression-check.mjs`

## 5. 证据

- 测试日志：`docs/implementation/phase-16/logs/2026-03-03-p16-web-test-ta-p16-006.txt`
- 专项检查日志：`docs/implementation/phase-16/logs/2026-03-03-p16-web-contract-regression-check-run.txt`
- 机读清单：`docs/implementation/phase-16/manifests/2026-03-03-p16-web-contract-regression-check.json`
