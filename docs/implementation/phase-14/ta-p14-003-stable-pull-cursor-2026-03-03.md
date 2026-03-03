# TA-P14-003 消息拉取稳定游标改造（替代 offset 风险）（2026-03-03）

- Task ID：TA-P14-003
- 阶段：Phase 14
- 状态：DONE
- 负责人角色：Backend + QA

## 1. 目标

将 `GET /api/v1/messages/pull` 从 `offset cursor` 升级为稳定 `keyset cursor`，消除“分页过程中发生清理/撤回后出现跳项或重复”的风险。

## 2. 实现摘要

1. `conversation_id` 维度拉取：
   - 游标语义切换为 `afterSeq`（最后一条消息的 `seq`）。
   - 响应游标继续使用字符串数值（如 `"2"`），兼容既有调用。
   - 查询语义为 `seq > afterSeq`，不再依赖 offset。
2. 全局拉取（不带 `conversation_id`）：
   - 使用 `g1.<base64url-json>` 的 keyset 游标，包含：
     - `sentAtMs`
     - `conversationId`
     - `seq`
     - `envelopeId`
   - 查询语义按 `(sent_at_ms, conversation_id, seq, envelope_id)` 递增推进。
3. 全局拉取不再接受 legacy 数字 offset 光标：
   - 返回 `VALIDATION_ERROR`，由 API 统一转换为 RFC7807。
4. SQLite/Postgres 仓储统一改造为 keyset 查询，并新增 pull 游标索引。

## 3. 变更文件

- `packages/node/src/services/message-service.ts`
- `packages/node/src/storage/mailbox-store.ts`
- `packages/node/src/storage/message-repository.ts`
- `packages/node/src/storage/postgres-message-repository.ts`
- `packages/node/src/services/message-service.test.ts`
- `packages/node/src/phase4-e2e.test.ts`
- `packages/node/scripts/run-phase14-stable-pull-cursor-check.ts`

## 4. 验证

1. 单测/E2E 新增：
   - `TA-P14-003 conversation pull cursor stays stable after cleanup between pages`
   - `TA-P14-003 global pull cursor is keyset token and survives cleanup drift`
   - `TA-P14-003 E2E pull cursor stays stable when cleanup happens between pages`
2. 专项脚本：
   - `packages/node/scripts/run-phase14-stable-pull-cursor-check.ts`
3. 构建与测试：
   - `corepack pnpm --filter @telagent/node build`
   - `corepack pnpm --filter @telagent/node test`

## 5. 证据

- 构建日志：`docs/implementation/phase-14/logs/2026-03-03-p14-node-build.txt`
- 测试日志：`docs/implementation/phase-14/logs/2026-03-03-p14-node-test.txt`
- 专项检查日志：`docs/implementation/phase-14/logs/2026-03-03-p14-stable-pull-cursor-check-run.txt`
- 机读清单：`docs/implementation/phase-14/manifests/2026-03-03-p14-stable-pull-cursor-check.json`
