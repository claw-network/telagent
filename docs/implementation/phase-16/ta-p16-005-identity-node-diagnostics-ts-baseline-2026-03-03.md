# TA-P16-005 身份与节点诊断增强（TS 基线）（2026-03-03）

- Task ID：TA-P16-005
- 阶段：Phase 16
- 状态：DONE
- 负责人角色：Frontend + Backend

## 1. 目标

在 `TypeScript + React + Vite` 基线上补齐身份与节点诊断能力，满足以下验收口径：

1. DID 解析可视化（method/identifier/规范化 DID）；
2. DID hash 固定为 `keccak256(utf8(did))` 并在页面可见；
3. 节点健康与运行态细节可视化（`/api/v1/node` + `/api/v1/node/metrics`）；
4. 相关逻辑具备独立单测与专项检查脚本。

## 2. 实现摘要

1. 新增诊断领域模块 `identity-node-diagnostics.ts`：
   - `hashDidKeccakUtf8(did)`：统一 DID hash 计算规则；
   - `buildDidDiagnostics(...)`：DID 解析、合法性校验、远端 hash 对比；
   - `buildNodeRuntimeDiagnostics(...)`：节点与指标聚合、告警级别归一化。
2. `api-client.ts` 新增 `getNodeMetrics()`，固定访问 `/api/v1/node/metrics`。
3. `App.tsx` 增强：
   - Identity 页新增 sender/lookup 双诊断面板（含 DID hash 与远端 hash 比对）；
   - Settings 页新增 Node Runtime Diagnostics 状态面板；
   - `checkNodeHealth` 并发拉取 node info + node metrics 并记录运行态。
4. 新增测试与脚本：
   - `identity-node-diagnostics.test.ts`（DID hash、解析、节点告警级别）；
   - `run-phase16-identity-node-diagnostics-check.mjs`（机读清单输出）。

## 3. 变更文件

- `packages/web/src/core/identity-node-diagnostics.ts`
- `packages/web/src/core/identity-node-diagnostics.test.ts`
- `packages/web/src/core/api-client.ts`
- `packages/web/src/App.tsx`
- `packages/web/package.json`
- `packages/web/scripts/run-phase16-identity-node-diagnostics-check.mjs`

## 4. 验证

1. `corepack pnpm --filter @telagent/web typecheck`
2. `corepack pnpm --filter @telagent/web build`
3. `corepack pnpm --filter @telagent/web test`
4. `node packages/web/scripts/run-phase16-identity-node-diagnostics-check.mjs`

## 5. 证据

- 类型检查日志：`docs/implementation/phase-16/logs/2026-03-03-p16-web-typecheck-ta-p16-005.txt`
- 构建日志：`docs/implementation/phase-16/logs/2026-03-03-p16-web-build-ta-p16-005.txt`
- 测试日志：`docs/implementation/phase-16/logs/2026-03-03-p16-web-test-ta-p16-005.txt`
- 专项检查日志：`docs/implementation/phase-16/logs/2026-03-03-p16-identity-node-diagnostics-check-run.txt`
- 机读清单：`docs/implementation/phase-16/manifests/2026-03-03-p16-identity-node-diagnostics-check.json`
