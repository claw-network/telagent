# TA-P2-007 identities/groups API 检查点（2026-03-02）

- Task ID：TA-P2-007
- 阶段：Phase 2
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现并打通 `identities*` 与 `groups*` 必选接口，确保全部在 `/api/v1/*` 前缀下可访问。

## 2. 实现

- 身份接口：`packages/node/src/api/routes/identities.ts`
  - `GET /api/v1/identities/self`
  - `GET /api/v1/identities/:did`
- 群组接口：`packages/node/src/api/routes/groups.ts`
  - `POST /api/v1/groups`
  - `GET /api/v1/groups/:groupId`
  - `GET /api/v1/groups/:groupId/members`
  - `POST /api/v1/groups/:groupId/invites`
  - `POST /api/v1/groups/:groupId/invites/:inviteId/accept`
  - `DELETE /api/v1/groups/:groupId/members/:memberDid`
  - `GET /api/v1/groups/:groupId/chain-state`
- 路由体解析修正：`packages/node/src/api/router.ts`
  - 允许 `DELETE` 请求解析 JSON body，确保 removeMember 接口可收 `operatorDid/mlsCommitHash`

## 3. 验证结果

- 契约测试：`packages/node/src/api-contract.test.ts`
  - 用例：`identities and groups endpoints are accessible with expected status codes`
- 前缀测试：`packages/node/src/api-prefix.test.ts`
  - 用例：`routes only serve /api/v1/*`
- 日志：`docs/implementation/phase-2/logs/2026-03-02-p2-node-test.txt`
- 结论：`identities/groups` 路由可访问且符合前缀规范。

## 4. 下一步

进入 `TA-P2-008`（消息/附件/联邦 API 骨架）与 `TA-P2-009`（契约测试收口）。
