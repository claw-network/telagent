# TA-P6-003 Mailbox Store Adapter + Postgres Backend（2026-03-03）

- Task ID：TA-P6-003
- 阶段：Phase 6（发布后改进）
- 状态：DONE
- 负责人角色：Backend Engineer / SRE / QA

## 1. 目标

在 `TA-P6-002` ADR 基础上，落地可切换的 mailbox store 适配层，支持：

1. `sqlite`（单机 fallback）
2. `postgres`（多实例主方案）

并保持现有 `/api/v1/*` 行为与消息语义不变。

## 2. 实现

### 2.1 存储适配层

- 新增统一接口：`packages/node/src/storage/mailbox-store.ts`
  - 规范 `seq / envelope / dedupe / retraction / ttl cleanup` 的最小能力面

### 2.2 SQLite 实现升级

- 修改：`packages/node/src/storage/message-repository.ts`
  - 实现 `MailboxStore`
  - 补充 `close()` 生命周期接口

### 2.3 Postgres 实现新增

- 新增：`packages/node/src/storage/postgres-message-repository.ts`
  - `mailbox_envelopes / mailbox_retractions / mailbox_sequences` 表结构
  - `nextSequence` 使用事务 + 行锁保障会话序单调
  - 支持 `init()` 建表与 `close()` 连接池回收

### 2.4 运行时配置与接线

- 修改：`packages/node/src/config.ts`
  - 新增 `mailboxStore` 配置域
  - 支持 `TELAGENT_MAILBOX_STORE_BACKEND=sqlite|postgres`
- 修改：`packages/node/src/app.ts`
  - 根据配置选择 `MessageRepository` 或 `PostgresMessageRepository`
  - 节点启动时执行 store `init()`，关闭时执行 `close()`

### 2.5 MessageService 异步化兼容

- 修改：`packages/node/src/services/message-service.ts`
  - `send/pull/maintenance` 改为异步，统一适配 sync/async store
- 修改：`packages/node/src/api/routes/messages.ts`
  - 路由层按异步服务调用
- 修改脚本：
  - `packages/node/scripts/run-phase4-load-test.ts`
  - `packages/node/scripts/run-phase6-mailbox-persistence-check.ts`

### 2.6 验证补齐

- 新增配置测试：`packages/node/src/config.test.ts`
  - sqlite 默认
  - postgres 参数解析
  - 缺失 pg url 拒绝启动
  - 非法 backend 拒绝启动
- 新增验收脚本：`packages/node/scripts/run-phase6-store-backend-check.ts`
  - 输出 `TA-P6-003` 机读清单

## 3. 证据

- 构建日志：`docs/implementation/phase-6/logs/2026-03-03-p6-node-build.txt`
- Node 测试日志：`docs/implementation/phase-6/logs/2026-03-03-p6-node-test.txt`
- 工作区测试日志：`docs/implementation/phase-6/logs/2026-03-03-p6-workspace-test.txt`
- 后端切换检查日志：`docs/implementation/phase-6/logs/2026-03-03-p6-store-backend-check-run.txt`
- 后端切换检查清单：`docs/implementation/phase-6/manifests/2026-03-03-p6-store-backend-check.json`

## 4. 结论

- `TA-P6-003`：PASS
- `sqlite` fallback 与 `postgres` 主方案均可被配置解析并接入运行时。
- 下一步进入 `TA-P6-004`：发布后稳定性回归与 Phase 6 Gate 收口。
