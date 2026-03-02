# TA-P0-004 冻结 DID hash 与 controller 鉴权规则

- Task ID：TA-P0-004
- 负责人角色：Security Engineer
- 状态：DONE
- 冻结日期：2026-03-02

## 1. 目标

统一 TelAgent 的 DID 解析、hash 计算与 controller 鉴权，确保与 ClawNet Identity 语义一致且可验证。

## 2. 输入约束（固定）

1. 仅允许 `did:claw:*`。
2. 服务端先做 DID 格式校验，再做 hash 计算。
3. DID hash 规则固定：`keccak256(utf8(did))`。

建议校验正则：`^did:claw:[A-Za-z0-9._:-]+$`

## 3. 鉴权判定顺序（固定）

对所有群组链上写操作（create/invite/accept/remove）：

1. 计算 `didHash = keccak256(utf8(did))`
2. 检查 `identity.isActive(didHash) == true`
3. 检查 `identity.getController(didHash) == msg.sender`
4. 不满足任意条件时返回 RFC7807 错误

附加规则：

- `acceptInvite`：仅被邀请 DID 的 controller 可执行
- `inviteMember/removeMember`：仅群创建者 DID 的 controller 可执行

## 4. 失败映射

| 场景 | code | HTTP |
| --- | --- | --- |
| DID 格式非法 | `VALIDATION_ERROR` | 400 |
| DID 非 active | `FORBIDDEN` | 403 |
| controller 不匹配 | `FORBIDDEN` | 403 |

## 5. 伪代码

```ts
function authorizeDidWrite(did: string, caller: Address) {
  assert(matchesDidClaw(did));
  const didHash = keccak256(toUtf8Bytes(did));
  assert(identity.isActive(didHash) === true);
  assert(identity.getController(didHash) === caller);
  return didHash;
}
```

## 6. 对齐核对单（ClawNet）

- DID 前缀语义：一致
- hash 算法：一致（`keccak256(utf8(did))`）
- active/controller 判定：一致
- 非法输入返回标准错误：一致（RFC7807 + 统一 code）

## 7. 证据

- 设计文档身份章节：`docs/design/telagent-v1-design.md`（8.1, 8.2）
- 错误码映射：`docs/implementation/phase-0/ta-p0-003-error-code-dictionary.md`
