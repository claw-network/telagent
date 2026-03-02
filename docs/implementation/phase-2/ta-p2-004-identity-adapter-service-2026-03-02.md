# TA-P2-004 IdentityAdapterService 检查点（2026-03-02）

- Task ID：TA-P2-004
- 阶段：Phase 2
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现身份适配服务，保证 Node 层对 DID 的链上校验满足固定规范：

- DID 仅允许 `did:claw:*`
- DID hash 固定 `keccak256(utf8(did))`
- 写操作前可验证 `active/controller`

## 2. 实现

- 核心实现：`packages/node/src/services/identity-adapter-service.ts`
  - `resolve(rawDid)`：
    - 使用 `isDidClaw` 校验格式
    - 使用 `hashDid` 计算 DID hash
    - 读取 `isActive/getController/getActiveKey`
    - 控制器为零地址时返回 `NOT_FOUND`
  - `assertActiveDid(rawDid)`：inactive/revoked 返回 `UNPROCESSABLE`
  - `assertControllerBySigner(rawDid)`：控制器与 signer 不一致返回 `FORBIDDEN`
- 接线：
  - `packages/node/src/app.ts` 中注入 `IdentityAdapterService`
  - `packages/node/src/api/routes/identities.ts` 对外提供 `GET /api/v1/identities/self` 与 `GET /api/v1/identities/:did`
  - `packages/node/src/services/group-service.ts` 链上写操作复用 identity 校验

## 3. 验证结果

- API 契约测试：`packages/node/src/api-contract.test.ts`
  - `identities and groups endpoints are accessible with expected status codes`
- 前缀测试：`packages/node/src/api-prefix.test.ts`
  - `identity endpoint responds with data envelope`
- 实际日志：`docs/implementation/phase-2/logs/2026-03-02-p2-node-test.txt`
- 结论：IdentityAdapter 的 DID 格式、hash、active/controller 校验链路可用。

## 4. 下一步

进入 `TA-P2-005`（GasService）与 `TA-P2-006`（GroupService）验收收口。
