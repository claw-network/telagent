# TA-P1-010 ClawRouter 模块注册（2026-03-03）

- Task ID：TA-P1-010
- 阶段：Phase 1（合约与部署）
- 状态：DONE
- 负责人角色：Chain Engineer

## 1. 目标

完成 `TELAGENT_GROUP` 模块键注册脚本收口，确保 Router 端可查询到 `TelagentGroupRegistry` 模块地址，并支持幂等重复执行。

## 2. 实现

### 2.1 注册脚本增强

- 更新文件：`packages/contracts/scripts/register-telagent-group-module.ts`
- 增强点：
  - 增加 `getModuleOrZero` 查询与注册后校验；
  - 支持幂等执行（目标地址已注册时跳过交易）；
  - 增加 JSON 输出（`TELAGENT_ROUTER_REGISTER_OUTPUT_PATH`）；
  - 保留 CLI 用法（通过 `CLAW_ROUTER_ADDRESS` 与 `TELAGENT_GROUP_REGISTRY_ADDRESS` 传入参数）。

### 2.2 本地校验脚本

- 新增文件：`packages/contracts/scripts/run-phase1-router-module-check.ts`
- 校验流程：
  1. 部署 `MockClawRouter`；
  2. 首次注册 `TELAGENT_GROUP` 模块；
  3. 二次重放注册（验证幂等）；
  4. 输出机读清单并断言 `decision=PASS`。

### 2.3 Mock 合约

- 新增文件：`packages/contracts/contracts/mocks/MockClawRouter.sol`
- 提供：
  - `registerModule(bytes32 key, address addr)`
  - `getModuleOrZero(bytes32 key)`

## 3. 执行命令

```bash
pnpm --filter @telagent/contracts build
pnpm --filter @telagent/contracts test
pnpm --filter @telagent/contracts exec hardhat run scripts/run-phase1-router-module-check.ts --network hardhat
```

## 4. 证据

- 构建日志：`docs/implementation/phase-1/logs/2026-03-03-p1-contracts-build.txt`
- 测试日志：`docs/implementation/phase-1/logs/2026-03-03-p1-contracts-test.txt`
- 运行日志：`docs/implementation/phase-1/logs/2026-03-03-p1-router-module-check-run.txt`
- 机读清单：`docs/implementation/phase-1/manifests/2026-03-03-p1-router-module-check.json`

## 5. 结论

- `TA-P1-010`：PASS
- 模块键注册后可查询，且重复执行具备幂等行为，满足可选任务验收标准。
