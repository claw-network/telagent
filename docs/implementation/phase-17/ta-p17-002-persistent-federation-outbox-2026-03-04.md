# TA-P17-002 持久化 Federation Outbox（2026-03-04）

- Task ID：TA-P17-002
- 状态：DONE
- 日期：2026-03-04

## 目标

将联邦出站从内存队列升级为持久化 outbox，确保重启后仍可重放。

## 关键实现

- 出站投递服务：`packages/node/src/services/federation-delivery-service.ts`
- outbox 接口：`packages/node/src/storage/mailbox-store.ts`
- SQLite 实现：`packages/node/src/storage/message-repository.ts`
- Postgres 实现：`packages/node/src/storage/postgres-message-repository.ts`
- 应用接线：`packages/node/src/app.ts`（delivery service 注入 mailbox store）

## 验收证据

- 单测：`packages/node/src/services/federation-delivery-service.test.ts`
  - 持久化后重启可继续投递
  - 失败重试可回写 attempt/backoff，并最终成功清理
- 全量回归：`pnpm --filter @telagent/node test` 通过（0 fail）
