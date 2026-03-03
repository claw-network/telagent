# TA-P13-005 联邦重放保护增强（熔断+退避）（2026-03-03）

- Task ID：TA-P13-005
- 阶段：Phase 13
- 状态：DONE
- 负责人角色：Backend + Security

## 1. 目标

为联邦 DLQ 重放链路增加运行保护，避免故障放大和无效重放风暴。

## 2. 实现范围

### 2.1 FederationService 增强

- 更新：`packages/node/src/services/federation-service.ts`
- 新增能力：
  1. 重放退避：按 `consecutiveReplayFailures` 指数退避（`baseMs` ~ `maxMs`）；
  2. 按 `sourceDomain` 熔断：连续失败达到阈值后进入 OPEN；
  3. OPEN 期间重放请求被阻断并记录统计；
  4. `nodeInfo.resilience.replayProtection` 暴露保护状态。

### 2.2 配置与运行时接线

- 更新：`packages/node/src/config.ts`
- 更新：`packages/node/src/config.test.ts`
- 更新：`packages/node/src/app.ts`
- 更新：`.env.example`
- 新增环境变量：
  - `TELAGENT_FEDERATION_REPLAY_BACKOFF_BASE_MS`
  - `TELAGENT_FEDERATION_REPLAY_BACKOFF_MAX_MS`
  - `TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_FAIL_THRESHOLD`
  - `TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_COOLDOWN_SEC`

### 2.3 测试与专项脚本

- 更新单测：`packages/node/src/services/federation-service.test.ts`
  - `TA-P13-005 federation replay applies backoff and opens circuit on repeated failures`
  - `TA-P13-005 federation replay protection validates backoff range`
- 新增脚本：`packages/node/scripts/run-phase13-federation-protection-check.ts`

## 3. 检查结果

- `backoffScheduledPass=true`
- `circuitOpenedPass=true`
- `blockedWhileOpenPass=true`
- `recoveredAfterCooldownPass=true`
- 结论：`PASS`

## 4. 证据

- 代码：
  - `packages/node/src/services/federation-service.ts`
  - `packages/node/src/services/federation-service.test.ts`
  - `packages/node/src/config.ts`
  - `packages/node/src/config.test.ts`
  - `packages/node/src/app.ts`
  - `.env.example`
- 脚本：`packages/node/scripts/run-phase13-federation-protection-check.ts`
- 日志：
  - `docs/implementation/phase-13/logs/2026-03-03-p13-node-test.txt`
  - `docs/implementation/phase-13/logs/2026-03-03-p13-federation-protection-check-run.txt`
- 清单：`docs/implementation/phase-13/manifests/2026-03-03-p13-federation-protection-check.json`

## 5. 结论

- `TA-P13-005`：PASS
- 联邦重放具备可观测的退避与熔断保护能力，降低故障扩散风险。
