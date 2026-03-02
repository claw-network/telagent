# TA-P2-008 messages/attachments/federation API 骨架检查点（2026-03-02）

- Task ID：TA-P2-008
- 阶段：Phase 2
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现消息、附件、联邦接口骨架，保证基础请求可收发并统一使用规范 envelope/错误模型。

## 2. 实现

- messages：`packages/node/src/api/routes/messages.ts`
  - `POST /api/v1/messages`
  - `GET /api/v1/messages/pull`
- attachments：`packages/node/src/api/routes/attachments.ts`
  - `POST /api/v1/attachments/init-upload`
  - `POST /api/v1/attachments/complete-upload`
- federation：`packages/node/src/api/routes/federation.ts`
  - `POST /api/v1/federation/envelopes`
  - `POST /api/v1/federation/group-state/sync`
  - `POST /api/v1/federation/receipts`
  - `GET /api/v1/federation/node-info`

## 3. 验证结果

- 契约测试：`packages/node/src/api-contract.test.ts`
  - 用例：`messages, attachments and federation endpoints are accessible`
- 日志：`docs/implementation/phase-2/logs/2026-03-02-p2-node-test.txt`
- 结论：三类骨架接口均可访问并返回规范结构。

## 4. 下一步

进入 `TA-P2-009` 契约测试收口。
