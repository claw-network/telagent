# TA-P2-001 API Server 与路由挂载检查点（2026-03-02）

- Task ID：TA-P2-001
- 阶段：Phase 2
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

搭建 Node API Server，并确保核心路由仅通过 `/api/v1/*` 暴露。

## 2. 实现与证据

- API Server：`packages/node/src/api/server.ts`
  - 挂载路由前缀：
    - `/api/v1/node`
    - `/api/v1/identities`
    - `/api/v1/groups`
    - `/api/v1/wallets`
    - `/api/v1/messages`
    - `/api/v1/attachments`
    - `/api/v1/federation`
- 路由实现：`packages/node/src/api/router.ts`
- 运行时装配：`packages/node/src/app.ts`

## 3. 验证结果

- 路径前缀测试：`packages/node/src/api-prefix.test.ts`
- API 契约测试日志：`docs/implementation/phase-2/logs/2026-03-02-p2-api-contract-test.txt`
- 结论：`/api/v1/*` 以外路径返回 404，符合 Phase 0 路径冻结规则。

## 4. 下一步

推进 `TA-P2-002` / `TA-P2-003` 响应封装与错误链路验收。
