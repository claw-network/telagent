# TA-P1-001 合约接口审查与签字记录

- Task ID：TA-P1-001
- 阶段：Phase 1
- 状态：DONE
- 评审日期：2026-03-02
- 评审结论：PASS

## 1. 评审范围

- 合约：`packages/contracts/contracts/TelagentGroupRegistry.sol`
- 目标：冻结函数签名、关键参数语义、事件字段，作为 Phase 1 后续实现与测试基线。
- 依赖：
  - `TA-P0-004` DID/controller 鉴权规则
  - `TA-P0-005` 状态机 RFC

## 2. 输入资料

- 设计基线：`docs/design/telagent-v1-design.md`（9.2, 9.3）
- WBS 任务：`docs/implementation/telagent-v1-task-breakdown.md`
- 当前实现：`packages/contracts/contracts/TelagentGroupRegistry.sol`
- 测试证据：
  - `docs/implementation/phase-0/logs/2026-03-02-pnpm-build-escalated.log`
  - `docs/implementation/phase-0/logs/2026-03-02-pnpm-test-escalated-unrestricted.log`

## 3. 函数签名冻结检查表

| # | 设计基线签名（Design） | 当前合约签名（Code） | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | `createGroup(groupId, creatorDidHash, groupDomain, domainProofHash, initialMlsStateHash)` | `createGroup(bytes32, bytes32, string, bytes32, bytes32)` | 通过 | 见 `TelagentGroupRegistry.sol:108` |
| 2 | `inviteMember(groupId, inviteId, inviterDidHash, inviteeDidHash, mlsCommitHash)` | `inviteMember(bytes32, bytes32, bytes32, bytes32, bytes32)` | 通过 | 见 `TelagentGroupRegistry.sol:148` |
| 3 | `acceptInvite(groupId, inviteId, inviteeDidHash, mlsWelcomeHash)` | `acceptInvite(bytes32, bytes32, bytes32, bytes32)` | 通过 | 见 `TelagentGroupRegistry.sol:189` |
| 4 | `removeMember(groupId, operatorDidHash, memberDidHash, mlsCommitHash)` | `removeMember(bytes32, bytes32, bytes32, bytes32)` | 通过 | 见 `TelagentGroupRegistry.sol:227` |

## 4. 参数语义与校验冻结检查表

| 检查项 | 预期语义（Phase 0 基线） | 结果 | 备注 |
| --- | --- | --- | --- |
| DID active 校验 | 写操作前必须校验 `identity.isActive(didHash)` | 通过 | `_assertDidActive`，见 `TelagentGroupRegistry.sol:300` |
| DID controller 校验 | 写操作前必须校验 `identity.getController(didHash) == msg.sender` | 通过 | `_assertDidController`，见 `TelagentGroupRegistry.sol:292` |
| 群 owner 权限 | invite/remove 仅群 owner DID 可执行 | 通过 | 见 `TelagentGroupRegistry.sol:170`, `TelagentGroupRegistry.sol:245` |
| `groupDomain` 非空 | createGroup 必须校验非空 | 通过 | 见 `TelagentGroupRegistry.sol:118` |
| 哈希参数非 0 | `domainProofHash/mls*Hash` 非 0 | 通过 | 见 `TelagentGroupRegistry.sol:121`, `TelagentGroupRegistry.sol:162`, `TelagentGroupRegistry.sol:202`, `TelagentGroupRegistry.sol:240` |
| 成员状态机一致 | Pending/Finalized/Removed 与 RFC 一致 | 通过 | 见 `TelagentGroupRegistry.sol:182`, `TelagentGroupRegistry.sol:220`, `TelagentGroupRegistry.sol:257` |

## 5. 事件模型审查（可重建成员集）

| 事件 | 关键字段 | 可重建性判定 | 备注 |
| --- | --- | --- | --- |
| `GroupCreated` | `groupId`, `creatorDidHash`, `domainHash`, `domainProofHash`, `blockNumber` | 通过 | 覆盖群创建确权字段；`groupDomain` 由链上存储读取 |
| `MemberInvited` | `groupId`, `inviteId`, `inviterDidHash`, `inviteeDidHash`, `mlsCommitHash` | 通过 | 可重建 pending 成员集 |
| `MemberAccepted` | `groupId`, `inviteId`, `memberDidHash`, `mlsWelcomeHash` | 通过 | 可重建 finalized 成员集 |
| `MemberRemoved` | `groupId`, `memberDidHash`, `operatorDidHash`, `mlsCommitHash` | 通过 | 可重建 removed 成员集 |

## 6. 差异与决策记录

| 差异项 ID | 差异描述 | 影响 | 决策 | Owner | 截止日期 |
| --- | --- | --- | --- | --- | --- |
| DIFF-P1-001 | `GroupCreated` 事件使用 `domainHash` 而非明文 `groupDomain` | 不影响成员集重建；读取明文域名需查 storage | 保持现状（降低事件体积） | CE | 2026-03-09 |
| DIFF-P1-002 | `MemberAccepted` 使用字段名 `memberDidHash`（设计表述为 `inviteeDidHash`） | 命名差异，无语义偏差 | 保持现状（在 ABI 文档中注明） | CE | 2026-03-09 |

## 7. 结论

- 审查结论：PASS
- 是否允许进入 `TA-P1-002`：YES
- 条件放行项：无

## 8. 签字

- Chain Engineer：`Benjamin Linus / 2026-03-02`
- Security Engineer：`Benjamin Linus / 2026-03-02`
- QA：`Benjamin Linus / 2026-03-02`
- Tech Lead：`Benjamin Linus / 2026-03-02`
