# TA-P12-004 联邦 SLO 自动化（DLQ 自动重放 + burn-rate 告警）（2026-03-03）

- Task ID：TA-P12-004
- 阶段：Phase 12（v1.2 候选能力冻结与排程）
- 状态：DONE
- 负责人角色：SRE + Backend

## 1. 目标

落地联邦 DLQ 的自动重放与 burn-rate 告警能力，满足以下验收：

1. DLQ 支持定时自动重放（含启动时首轮执行）；
2. 可按 error budget 计算 burn-rate，并输出 WARN/CRITICAL 告警；
3. 节点监控快照可审计记录重放统计与告警状态；
4. 覆盖配置测试、服务测试、契约测试与专项检查脚本。

## 2. 实现范围

### 2.1 配置与环境变量扩展

- 更新：`packages/node/src/config.ts`
- 更新：`packages/node/src/config.test.ts`
- 更新：`.env.example`
- 新增配置：
  - `federationSlo.replayIntervalSec`
  - `federationSlo.replayBatchSize`
  - `federationSlo.replayStopOnError`
  - `monitoring.federationDlqErrorBudgetRatio`
  - `monitoring.federationDlqBurnRateWarn`
  - `monitoring.federationDlqBurnRateCritical`
- 约束：
  - `replayIntervalSec/replayBatchSize` 必须正整数；
  - burn-rate 相关阈值必须正数。

### 2.2 监控服务 burn-rate 指标与告警

- 更新：`packages/node/src/services/node-monitoring-service.ts`
- 更新：`packages/node/src/services/node-monitoring-service.test.ts`
- 新增：
  - `recordFederationDlqReplay(...)`
  - `snapshot().federationDlqReplay` 统计块
  - 告警码 `FEDERATION_DLQ_BURN_RATE`
- 行为：
  - 基于 `errorBudgetRatio` 计算 burn-rate；
  - 支持 WARN/CRITICAL 分级告警；
  - 持久记录最近一次重放窗口的 pending/replayed/failed 结果。

### 2.3 联邦 SLO 调度服务

- 新增：`packages/node/src/services/federation-slo-service.ts`
- 新增：`packages/node/src/services/federation-slo-service.test.ts`
- 核心能力：
  - `runOnce()`：读取 pending DLQ，执行批量重放，回写 monitoring 指标；
  - `start()/stop()`：定时调度自动重放，异常时不中断调度器。

### 2.4 Node 运行时接线与指标输出

- 更新：`packages/node/src/app.ts`
- 更新：`packages/node/src/api/routes/node.ts`
- 更新：`packages/node/src/api-contract.test.ts`
- 行为：
  - Node 启动后执行首轮 `federationSloService.runOnce()`，并启动定时器；
  - Node 停止时关闭 SLO 调度；
  - `/api/v1/node/metrics` 输出 `federationDlqReplay` 统计，用于运营/审计追踪。

## 3. 测试与校验

### 3.1 单测/契约测试

- `packages/node/src/config.test.ts`
  - `federation SLO automation config defaults are applied`
  - `federation SLO automation config accepts custom values`
  - `federation SLO burn-rate thresholds require positive values`
- `packages/node/src/services/node-monitoring-service.test.ts`
  - `TA-P12-004 federation DLQ burn-rate alert is emitted and tracked`
- `packages/node/src/services/federation-slo-service.test.ts`
  - `TA-P12-004 federation SLO runOnce auto-replays DLQ and records burn-rate metrics`
  - `TA-P12-004 federation SLO scheduler periodically replays DLQ`
- `packages/node/src/api-contract.test.ts`
  - `TA-P12-004 node metrics exposes federation DLQ replay burn-rate section`

### 3.2 Phase 12 专项检查脚本

- 新增：`packages/node/scripts/run-phase12-federation-slo-automation-check.ts`
- 校验项：
  1. WARN 窗口产生 `FEDERATION_DLQ_BURN_RATE` 告警；
  2. CRITICAL 窗口告警升级且 burn-rate 上升；
  3. 调度器实际触发重放（`runs delta >= 1`）；
  4. 调度后 pending DLQ 数量下降（自动重放生效）。
- 产出清单：`docs/implementation/phase-12/manifests/2026-03-03-p12-federation-slo-automation-check.json`

## 4. 执行命令

```bash
corepack pnpm --filter @telagent/node build
corepack pnpm --filter @telagent/node test
corepack pnpm --filter @telagent/node exec tsx scripts/run-phase12-federation-slo-automation-check.ts
```

## 5. 证据

- 代码：
  - `.env.example`
  - `packages/node/src/config.ts`
  - `packages/node/src/config.test.ts`
  - `packages/node/src/app.ts`
  - `packages/node/src/services/node-monitoring-service.ts`
  - `packages/node/src/services/node-monitoring-service.test.ts`
  - `packages/node/src/services/federation-slo-service.ts`
  - `packages/node/src/services/federation-slo-service.test.ts`
  - `packages/node/src/api/routes/node.ts`
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/scripts/run-phase12-federation-slo-automation-check.ts`
- 日志：
  - `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-federation-slo-automation-check-run.txt`
- 清单：
  - `docs/implementation/phase-12/manifests/2026-03-03-p12-federation-slo-automation-check.json`

## 6. 结论

- `TA-P12-004`：PASS
- 联邦 DLQ 自动重放与 burn-rate 分级告警已落地，且具备可审计指标与脚本化验证闭环。
