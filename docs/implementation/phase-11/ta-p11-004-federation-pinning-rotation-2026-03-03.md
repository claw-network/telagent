# TA-P11-004 联邦互信 pinning 与轮换策略（2026-03-03）

- Task ID：TA-P11-004
- 阶段：Phase 11（v1.1 安全与运营能力增强）
- 状态：DONE
- 负责人角色：Security / Backend

## 1. 目标

在联邦入口补齐来源密钥指纹 pinning 与轮换策略，避免“仅校验 sourceDomain”带来的冒用风险，并且让轮换流程具备可观测性。

## 2. 实现

### 2.1 FederationService pinning 机制

- 更新：`packages/node/src/services/federation-service.ts`
- 新增能力：
  - pinning 模式：`disabled | enforced | report-only`
  - 按域名配置 current/next key 集合（source key fingerprint）
  - cutover 时间点（`pinningCutoverAtMs`）驱动轮换切换
  - 三类联邦入口统一校验：
    - `receiveEnvelope`
    - `syncGroupState`
    - `recordReceipt`
  - `nodeInfo.security.pinning` 输出策略与统计：
    - `configuredDomains`
    - `cutoverReached`
    - `acceptedWithCurrent`
    - `acceptedWithNext`
    - `rejected`
    - `reportOnlyWarnings`

### 2.2 API 路由接入 sourceKeyId

- 更新：`packages/node/src/api/routes/federation.ts`
- 增加 `sourceKeyId` 解析顺序：
  1. Header：`x-telagent-source-key-id`
  2. Body：`sourceKeyId`
- 解析结果透传至 FederationService 的 `meta.sourceKeyId`。

### 2.3 配置扩展（环境变量）

- 更新：`packages/node/src/config.ts`
- 新增 federation pinning 配置：
  - `TELAGENT_FEDERATION_PINNING_MODE`
  - `TELAGENT_FEDERATION_PINNING_CURRENT_KEYS`
  - `TELAGENT_FEDERATION_PINNING_NEXT_KEYS`
  - `TELAGENT_FEDERATION_PINNING_CUTOVER_AT`
- 更新：`packages/node/src/config.test.ts`
  - 覆盖默认值、解析、非法模式、空映射保护、格式错误保护。
- 更新：`.env.example`
  - 增加 pinning 配置示例。

### 2.4 测试与演练脚本

- 更新测试：`packages/node/src/services/federation-service.test.ts`
  - `TA-P11-004 federation pinning enforces sourceKeyId with current/next rotation`
  - `TA-P11-004 federation pinning report-only mode allows traffic but records warnings`
- 更新契约测试：`packages/node/src/api-contract.test.ts`
  - 验证 `x-telagent-source-key-id` 头被路由层透传。
- 新增脚本：`packages/node/scripts/run-phase11-federation-pinning-check.ts`
  - 演练 pre-cutover / post-cutover 与缺失 key / 非法 key 场景；
  - 输出机读结果用于 Gate 复核。

## 3. 执行命令

```bash
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
pnpm --filter @telagent/node exec tsx scripts/run-phase11-federation-pinning-check.ts
```

## 4. 证据

- 代码：
  - `packages/node/src/services/federation-service.ts`
  - `packages/node/src/services/federation-service.test.ts`
  - `packages/node/src/api/routes/federation.ts`
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/src/config.ts`
  - `packages/node/src/config.test.ts`
  - `packages/node/scripts/run-phase11-federation-pinning-check.ts`
  - `.env.example`
- 日志：
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-federation-pinning-check-run.txt`
- 清单：
  - `docs/implementation/phase-11/manifests/2026-03-03-p11-federation-pinning-check.json`

## 5. 结论

- `TA-P11-004`：PASS
- 联邦 pinning 与轮换策略已落地，且 `node-info` 已提供策略状态与轮换统计，满足后续 Gate 审计需求。
