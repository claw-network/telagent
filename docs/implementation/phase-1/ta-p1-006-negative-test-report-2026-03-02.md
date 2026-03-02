# TA-P1-006 合约单元测试（异常流程）报告

- Task ID：TA-P1-006
- 阶段：Phase 1
- 状态：DONE
- 执行日期：2026-03-02
- 命令：`pnpm --filter @telagent/contracts test`

## 1. 验收目标

- 非 controller / revoked / 重复操作等异常路径回退全绿。

## 2. 异常流程覆盖

1. 非 controller 创建群失败
2. revoked DID 参与失败
3. duplicate invite / duplicate accept 失败
4. 非 owner invite/remove 失败
5. 非 invitee controller accept 失败
6. 删除群 owner 失败

## 3. 结果

- 结果：通过
- 汇总：`8 passing`（正向与异常用例均通过）

## 4. 证据

- 测试文件：`packages/contracts/test/TelagentGroupRegistry.test.ts`
- 权限检查点：`docs/implementation/phase-1/ta-p1-003-permission-constraint-checkpoint-2026-03-02.md`
- 测试执行记录：`docs/implementation/phase-1/ta-p1-003-test-run-2026-03-02.md`
