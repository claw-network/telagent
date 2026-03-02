# TA-P2-005 GasService 预检检查点（2026-03-02）

- Task ID：TA-P2-005
- 阶段：Phase 2
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现 gas 余额预检，并在余额不足时输出标准错误码 `INSUFFICIENT_GAS_TOKEN_BALANCE`。

## 2. 实现

- 核心实现：`packages/node/src/services/gas-service.ts`
  - `getNativeGasBalance()`：查询原生币余额
  - `getTokenBalance()`：查询 token 余额
  - `preflight({to,data})`：并行读取余额、gasPrice、estimateGas，计算 `estimatedFeeWei`
  - `assertSufficient(result)`：不足时抛 `TelagentError(ErrorCodes.INSUFFICIENT_GAS_TOKEN_BALANCE)`
- 集成点：`packages/node/src/services/group-service.ts`
  - `createGroup/inviteMember/acceptInvite/removeMember` 在发交易前都执行 `preflight + assertSufficient`

## 3. 验证结果

- 单测：`packages/node/src/services/gas-service.test.ts`
  - 用例：`assertSufficient throws INSUFFICIENT_GAS_TOKEN_BALANCE when native balance is not enough`
- 测试日志：`docs/implementation/phase-2/logs/2026-03-02-p2-node-test.txt`
- 结论：余额不足场景可稳定返回标准错误码。

## 4. 下一步

进入 `TA-P2-006` 链上写流程闭环验收。
