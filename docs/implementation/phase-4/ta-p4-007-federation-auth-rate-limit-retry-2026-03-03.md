# TA-P4-007 联邦接口鉴权/限流/重试（2026-03-03）

- Task ID：TA-P4-007
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：Security + Backend

## 1. 目标

为联邦接口补齐基础安全防线：来源校验、可选鉴权、速率限制、重试幂等。

## 2. 实现

- 联邦服务重构：`packages/node/src/services/federation-service.ts`
  - `receiveEnvelope/syncGroupState/recordReceipt` 新增 `meta(sourceDomain, authToken)` 输入
  - 新增可选共享令牌鉴权（`TELAGENT_FEDERATION_AUTH_TOKEN`）
  - 新增来源域 allowlist（`TELAGENT_FEDERATION_ALLOWED_DOMAINS`）
  - 新增分接口速率限制（envelopes/sync/receipts）
  - envelope 与 receipt 提供 retry-safe 幂等语义（重复提交去重）
- API 路由增强：`packages/node/src/api/routes/federation.ts`
  - 支持从 header/body 解析 `sourceDomain`
  - 支持从 `Authorization` 或 `x-telagent-federation-token` 读取 auth token
  - 缺失来源域直接返回校验错误
- 错误模型扩展：`packages/protocol/src/errors.ts`
  - 新增 `TOO_MANY_REQUESTS`，HTTP 429，RFC7807 类型 `https://telagent.dev/errors/too-many-requests`
- 配置扩展：
  - `packages/node/src/config.ts`
  - `.env.example`

## 3. 验证结果

- 新增联邦单测：`packages/node/src/services/federation-service.test.ts`
  - `TA-P4-007 federation envelopes support idempotent retries`
  - `TA-P4-007 federation auth token is enforced when configured`
  - `TA-P4-007 federation rate limit rejects burst traffic`
- Node 测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
- 结论：联邦基础安全能力（鉴权、限流、重试幂等）已生效。

## 4. 下一步

推进 `TA-P4-008`（node-info 域名一致性校验）。
