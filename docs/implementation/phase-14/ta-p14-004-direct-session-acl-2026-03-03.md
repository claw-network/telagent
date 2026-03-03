# TA-P14-004 direct 会话参与方访问控制强化（2026-03-03）

- Task ID：TA-P14-004
- 阶段：Phase 14
- 状态：DONE
- 负责人角色：Backend + Security + QA

## 1. 目标

为 `conversationType=direct` 增加参与方访问约束，确保 direct 会话仅允许已建立参与关系的 DID 写入；非参与方写入必须被拒绝并返回 RFC7807 标准错误。

## 2. 实现摘要

1. `MessageService.send` 在 direct 会话路径增加 ACL 校验：
   - 第一个发送方自动登记为参与方 A；
   - 第二个不同发送方登记为参与方 B；
   - 第三个不同发送方被拒绝（`FORBIDDEN`）。
2. ACL 持久化落地：
   - SQLite/Postgres 新增 `mailbox_direct_conversations` 表；
   - 约束 `conversation_id` 下最多两名参与方；
   - 重启后约束仍生效（防止重启绕过）。
3. 非参与方拒绝语义：
   - 返回 `TelagentError(ErrorCodes.FORBIDDEN, ...)`；
   - API 层统一转成 `application/problem+json`（RFC7807）。

## 3. 变更文件

- `packages/node/src/services/message-service.ts`
- `packages/node/src/storage/mailbox-store.ts`
- `packages/node/src/storage/message-repository.ts`
- `packages/node/src/storage/postgres-message-repository.ts`
- `packages/node/src/services/message-service.test.ts`
- `packages/node/src/phase4-e2e.test.ts`
- `packages/node/scripts/run-phase14-direct-session-acl-check.ts`

## 4. 验证

1. 服务层新增测试：
   - `TA-P14-004 direct conversation rejects non-participant writer after two participants are established`
   - `TA-P14-004 direct conversation ACL remains effective after repository-backed restart`
2. E2E 新增测试：
   - `TA-P14-004 E2E direct conversation blocks non-participant sender with RFC7807`
3. 专项脚本：
   - `packages/node/scripts/run-phase14-direct-session-acl-check.ts`
4. 构建与测试：
   - `corepack pnpm --filter @telagent/node build`
   - `corepack pnpm --filter @telagent/node test`

## 5. 证据

- 构建日志：`docs/implementation/phase-14/logs/2026-03-03-p14-node-build-ta-p14-004.txt`
- 测试日志：`docs/implementation/phase-14/logs/2026-03-03-p14-node-test-ta-p14-004.txt`
- 专项检查日志：`docs/implementation/phase-14/logs/2026-03-03-p14-direct-session-acl-check-run.txt`
- 机读清单：`docs/implementation/phase-14/manifests/2026-03-03-p14-direct-session-acl-check.json`
