# TA-P1-003 权限约束检查点（2026-03-02）

- Task ID：TA-P1-003
- 阶段：Phase 1
- 状态：DONE
- 负责人角色：Chain Engineer

## 1. 目标

落实并验证权限约束（active/controller/owner），确保非法调用全部回退。

## 2. 当前实现证据

代码实现（权限逻辑）：

- `packages/contracts/contracts/TelagentGroupRegistry.sol:125`
- `packages/contracts/contracts/TelagentGroupRegistry.sol:169`
- `packages/contracts/contracts/TelagentGroupRegistry.sol:244`
- `packages/contracts/contracts/TelagentGroupRegistry.sol:292`

现有测试覆盖：

- 非 controller 创建群失败：`packages/contracts/test/TelagentGroupRegistry.test.ts`
- revoked DID 参与失败：`packages/contracts/test/TelagentGroupRegistry.test.ts`
- owner 邀请/移除路径：`packages/contracts/test/TelagentGroupRegistry.test.ts`

## 3. 新增验收覆盖（2026-03-02）

已补齐并通过以下异常回退测试：

1. 非 owner 调用 `inviteMember/removeMember` 回退。
2. 非邀请目标 DID 调用 `acceptInvite` 回退。
3. 删除群 owner 回退（`CannotRemoveOwner`）。

测试结果：`8 passing`（`pnpm --filter @telagent/contracts test`）。

## 4. 下一步

- 推进 `TA-P1-004`（事件模型）验收收口。
