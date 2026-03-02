# TA-P0-006 DomainProofV1 规范

- Task ID：TA-P0-006
- 负责人角色：Security Engineer
- 状态：DONE
- 冻结日期：2026-03-02

## 1. 目标

定义群域名可验证证明（DomainProofV1），用于 `createGroup` 前后的一致性校验和链上哈希绑定。

## 2. 证明文档位置（固定）

- URL：`https://{groupDomain}/.well-known/telagent/group-proof/{groupId}.json`

`groupDomain` 必须与创建请求中的域名完全一致（不允许跨域跳转后替换主体域名）。

## 3. 最小字段集（固定）

```json
{
  "groupId": "0x...",
  "groupDomain": "example.com",
  "creatorDid": "did:claw:alice",
  "nodeInfoUrl": "https://example.com/api/v1/federation/node-info",
  "issuedAt": "2026-03-02T09:00:00Z",
  "expiresAt": "2026-03-09T09:00:00Z",
  "nonce": "random-string",
  "signature": "0x..."
}
```

## 4. 校验流程（固定）

1. `groupDomain` 与请求参数严格相等。
2. `expiresAt` 必须晚于当前时间。
3. 请求 `nodeInfoUrl`，接口必须可达且路径必须是 `/api/v1/federation/node-info`。
4. `nodeInfoUrl` 的主域名必须与 `groupDomain` 一致。
5. 对证明文档执行 canonical JSON 序列化，计算：
   - `domainProofHash = keccak256(canonical_json_bytes)`
6. 上链提交的 `domainProofHash` 必须与第 5 步一致。

## 5. 有效期策略（v1）

1. 推荐 `expiresAt - issuedAt <= 7d`。
2. 过期证明不得用于新交易。
3. 发现过期返回：`UNPROCESSABLE_ENTITY`（422）。

## 6. 失败映射

| 场景 | code | HTTP |
| --- | --- | --- |
| 证明文档缺字段/格式非法 | `VALIDATION_ERROR` | 400 |
| `nodeInfoUrl` 不可达或域名不一致 | `UNPROCESSABLE_ENTITY` | 422 |
| `domainProofHash` 与链上提交不一致 | `CONFLICT` | 409 |
| DID 非 `did:claw:*` | `VALIDATION_ERROR` | 400 |

## 7. 安全说明

- v1 允许“服务端预校验后提交链交易”，完整自动挑战机制放入 v1.1。
- 对同一 `groupId` 的证明文档必须幂等可重放验证。

## 8. 证据

- 设计文档 DomainProof 章节：`docs/design/telagent-v1-design.md`（9.4）
- DID 鉴权 RFC：`docs/implementation/phase-0/ta-p0-004-did-auth-rfc.md`
