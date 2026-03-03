# TA-P4-008 node-info 域名一致性校验（2026-03-03）

- Task ID：TA-P4-008
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：Security Engineer / Backend Engineer

## 1. 目标

确保联邦来源域与群状态同步域一致，并在 node-info 中公开本节点域与安全策略，支撑跨域互认。

## 2. 实现

- `FederationService` 域名策略：`packages/node/src/services/federation-service.ts`
  - 统一域名规范化与格式校验（含可选端口）
  - `syncGroupState` 要求 `groupDomain`（若提供）必须与 `sourceDomain` 一致
  - `nodeInfo()` 新增 `domain` 与 `security` 信息（auth mode / allowlist / rate limit）
- 配置项接入：`packages/node/src/config.ts`
  - `federation.selfDomain`
  - allowlist 与速率阈值
- 联邦路由接入来源域解析：`packages/node/src/api/routes/federation.ts`

## 3. 验证结果

- 新增联邦单测：`packages/node/src/services/federation-service.test.ts`
  - `TA-P4-008 group-state sync enforces domain consistency`
  - `TA-P4-008 node-info publishes domain and federation security policy`
- API 契约测试：`packages/node/src/api-contract.test.ts`（federation 请求补齐 `sourceDomain`）
- Node 测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
- 结论：域名一致性校验与 node-info 域名声明已落地。

## 4. 下一步

进入 `TA-P4-009`（E2E 主链路）。
