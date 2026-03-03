# TA-P4-003 Envelope 去重与幂等写入（2026-03-03）

- Task ID：TA-P4-003
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现 `envelopeId` 去重，保证重复投递时返回同一结果，不重复入箱；同 ID 不同 payload 必须拒绝。

## 2. 实现

- API 入参扩展：`packages/protocol/src/schema.ts`
  - `SendMessageSchema` 新增可选字段 `envelopeId`
- `MessageService` 幂等去重：`packages/node/src/services/message-service.ts`
  - 新增 `envelopeById` 索引
  - 新增 `idempotencySignatureByEnvelopeId` 签名校验
  - 同 `envelopeId` + 同签名：返回已存在 envelope（幂等）
  - 同 `envelopeId` + 不同签名：抛 `CONFLICT`
- 新增单测：`packages/node/src/services/message-service.test.ts`
  - `TA-P4-003 dedupe keeps idempotent writes for same envelopeId`
  - `TA-P4-003 duplicate envelopeId with different payload is rejected`

## 3. 验证结果

- Node 测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
- 结论：重复 envelope 不再重复入箱，幂等语义成立。

## 4. 下一步

推进 `TA-P4-004` TTL 清理任务。
