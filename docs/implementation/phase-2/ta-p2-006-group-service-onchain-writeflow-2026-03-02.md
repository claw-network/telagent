# TA-P2-006 GroupService 链上写流程检查点（2026-03-02）

- Task ID：TA-P2-006
- 阶段：Phase 2
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现群组写流程主链路：`create/invite/accept/remove`，并能形成可复核的链上交易闭环。

## 2. 实现

- 核心实现：`packages/node/src/services/group-service.ts`
  - `createGroup`：
    - bytes32 输入校验
    - identity controller 校验
    - gas 预检
    - 写链并落库 `PENDING_ONCHAIN -> ACTIVE`
  - `inviteMember`：
    - owner 权限校验
    - invitee DID active 校验
    - gas 预检 + 链上邀请
  - `acceptInvite`：
    - invitee controller 校验
    - gas 预检 + 链上接受
  - `removeMember`：
    - owner 权限校验
    - member DID 格式校验
    - gas 预检 + 链上移除
- 写后视图：
  - `getGroup/listMembers/getChainState`
  - 持久化：`packages/node/src/storage/group-repository.ts`

## 3. 验证结果

- 真实链集成脚本：`packages/node/scripts/run-phase2-testnet-integration.ts`
- 执行日志：`docs/implementation/phase-2/logs/2026-03-02-p2-testnet-integration-run.txt`
- 输出清单：`docs/implementation/phase-2/manifests/2026-03-02-p2-testnet-integration.json`
  - 包含 `createGroup/inviteMember/acceptInvite/removeMember` 四个 tx hash
  - `viewChecks.finalizedMembersCount=1`
  - `viewChecks.removedMembersCount=1`
- 结论：链上写流程与本地读模型形成闭环，主链路可执行。

## 4. 下一步

进入 `TA-P2-007` API 收口与 `TA-P2-010` 集成证据归档。
