# TA-P4-002 Envelope 序号生成与单调保障（2026-03-03）

- Task ID：TA-P4-002
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现会话内 seq 单调递增能力，并与消息服务解耦，保证序号策略可测试、可替换。

## 2. 实现

- 新增序号分配器：`packages/node/src/services/sequence-allocator.ts`
  - `next(conversationId)`：返回下一序号
  - `current(conversationId)`：读取当前序号
- `MessageService` 改造：`packages/node/src/services/message-service.ts`
  - 注入 `SequenceAllocator`
  - 发送消息时统一走分配器生成 seq
- 新增单测：`packages/node/src/services/message-service.test.ts`
  - 用例：`TA-P4-002 sequence allocator keeps per-conversation monotonic order`

## 3. 验证结果

- Node 测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
- 结论：同会话 seq 单调递增，跨会话计数相互独立。

## 4. 下一步

推进 `TA-P4-003` 去重与幂等写入。
