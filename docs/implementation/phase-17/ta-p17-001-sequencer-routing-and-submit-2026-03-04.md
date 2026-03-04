# TA-P17-001 Sequencer 归属与远端提交链路（2026-03-04）

- Task ID：TA-P17-001
- 状态：DONE
- 日期：2026-03-04

## 目标

把消息写入路由改造为“按 sequencer 归属提交”，并确保本地视图可回写。

- `group`：sequencer = `groupDomain`
- `direct`：sequencer = `min(selfDomain, targetDomain)`

## 关键实现

- 新增 sequencer 解析：`packages/node/src/services/sequencer-domain.ts`
- 消息发送路径：`packages/node/src/api/routes/messages.ts`
- 远端提交入口：`packages/node/src/api/routes/federation.ts` (`/api/v1/federation/messages/submit`)
- 联邦入站写入：`packages/node/src/services/message-service.ts` (`ingestFederatedEnvelope`)

## 验收证据

- `packages/node/src/api-contract.test.ts`
- `packages/node/src/phase4-e2e.test.ts`
- `pnpm --filter @telagent/node test` 通过（0 fail）
