# TA-P1-008 回滚脚本与 Runbook（2026-03-02）

- Task ID：TA-P1-008
- 阶段：Phase 1
- 状态：DONE
- 负责人角色：Chain Engineer

## 1. 目标

提供可执行回滚脚本与演练步骤，支持 UUPS proxy 从新实现回滚到指定旧实现。

## 2. 脚本清单

1. 回滚脚本：`packages/contracts/scripts/rollback-telagent-group-registry.ts`
2. 本地演练脚本：`packages/contracts/scripts/rollback-drill-local.ts`

补充说明：
- `rollback-drill-local.ts` 已修复为在升级与回滚后显式 `wait()` 交易确认，避免测试网环境下读取到旧实现地址。

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

- 当前状态：DONE（已完成）
- 命令（testnet）：

```bash
CLAW_IDENTITY_ADDRESS=0xee9B2D7eb0CD51e1d0a14278bCA32b02548D1149 \
ROLLBACK_DRILL_RECORD_PATH=docs/implementation/phase-1/manifests/2026-03-02-testnet-rollback-drill.json \
pnpm --filter @telagent/contracts exec hardhat run scripts/rollback-drill-local.ts --network clawnetTestnet
```

- 执行日志：`docs/implementation/phase-1/manifests/2026-03-02-testnet-rollback-drill.txt`
- 演练记录：`docs/implementation/phase-1/manifests/2026-03-02-testnet-rollback-drill.json`
- 关键验证：
  - `implementationAfterUpgrade` = `0xB3DCf86e16d277F6f3A8068F0165b72A98B0dFd6`
  - `implementationAfterRollback` = `0x8a0DF8503202828A7808C3cA2E0753ecb91A28C3`
  - `rollbackSucceeded` = `true`

## 6. 下一步

1. 进入 `TA-P1-011`，提交 Phase 1 Gate 评审材料。
