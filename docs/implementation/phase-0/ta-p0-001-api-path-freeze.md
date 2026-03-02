# TA-P0-001 冻结 API 路径规则（仅 `/api/v1/*`）

- Task ID：TA-P0-001
- 负责人角色：Protocol Owner
- 状态：DONE
- 冻结日期：2026-03-02

## 1. 冻结结论

1. 所有对外 HTTP API 必须且只能挂载在 `/api/v1/*`。
2. 禁止暴露以下路径风格：
   - `/v1/*`
   - `/api/*`（无版本号）
   - `/api/v2/*` 或其他多版本并行路径（Phase 0 不允许）
3. 资源命名使用复数名词，和 v1 设计文档保持一致。

## 2. v1 规范路由白名单

- `GET /api/v1/identities/self`
- `GET /api/v1/identities/{did}`
- `POST /api/v1/groups`
- `GET /api/v1/groups/{groupId}`
- `GET /api/v1/groups/{groupId}/members`
- `POST /api/v1/groups/{groupId}/invites`
- `POST /api/v1/groups/{groupId}/invites/{inviteId}/accept`
- `DELETE /api/v1/groups/{groupId}/members/{memberDid}`
- `GET /api/v1/groups/{groupId}/chain-state`
- `POST /api/v1/messages`
- `GET /api/v1/messages/pull`
- `POST /api/v1/attachments/init-upload`
- `POST /api/v1/attachments/complete-upload`
- `POST /api/v1/federation/envelopes`
- `POST /api/v1/federation/group-state/sync`
- `POST /api/v1/federation/receipts`
- `GET /api/v1/federation/node-info`

## 3. 评审检查项

- 路由注册前缀固定常量：`/api/v1`
- 禁止在代码中出现裸 `/api/` 或 `/v1/` 的新挂载点
- API 契约测试必须包含“非法路径拒绝”用例

## 4. 证据

- 设计文档路由章节：`docs/design/telagent-v1-design.md`（11.1, 11.2）
- Phase 0 产物索引：`docs/implementation/phase-0/README.md`
