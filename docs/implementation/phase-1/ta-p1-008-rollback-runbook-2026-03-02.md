# TA-P1-008 回滚脚本与 Runbook（2026-03-02）

- Task ID：TA-P1-008
- 阶段：Phase 1
- 状态：BLOCKED
- 负责人角色：Chain Engineer

## 1. 目标

提供可执行回滚脚本与演练步骤，支持 UUPS proxy 从新实现回滚到指定旧实现。

## 2. 脚本清单

1. 回滚脚本：`packages/contracts/scripts/rollback-telagent-group-registry.ts`
2. 本地演练脚本：`packages/contracts/scripts/rollback-drill-local.ts`

## 3. 环境变量

### 3.1 回滚脚本（生产/测试网）

- `TELAGENT_GROUP_REGISTRY_PROXY_ADDRESS`
- `TARGET_IMPLEMENTATION_ADDRESS`
- `ROLLBACK_RECORD_PATH`（可选）

### 3.2 本地演练脚本

- `CLAW_IDENTITY_ADDRESS`
- `ROLLBACK_DRILL_RECORD_PATH`（可选）

## 4. 本地演练结果

命令：

```bash
CLAW_IDENTITY_ADDRESS=0x0000000000000000000000000000000000000001 \
ROLLBACK_DRILL_RECORD_PATH=docs/implementation/phase-1/manifests/2026-03-02-local-rollback-drill.json \
pnpm --filter @telagent/contracts exec hardhat run scripts/rollback-drill-local.ts --network hardhat
```

结果：通过

- 证据：`docs/implementation/phase-1/manifests/2026-03-02-local-rollback-drill.json`
- 核心判据：`rollbackSucceeded: true`

## 5. 测试网演练状态

- 当前状态：BLOCKED（部署账户余额不足，无法完成测试网升级/回滚交易）
- 依赖：`TA-P1-007` testnet 账户充值后再执行。

## 6. 下一步

1. 完成 testnet 资金准备。
2. 在 testnet 执行升级 -> 回滚演练并归档记录。
3. 演练通过后将 TA-P1-008 状态改为 DONE。
