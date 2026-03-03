# TA-P6-001 离线邮箱持久化（2026-03-03）

- Task ID：TA-P6-001
- 阶段：Phase 6（发布后改进）
- 状态：DONE
- 负责人角色：Backend Engineer / SRE / QA

## 1. 背景

Phase 5 Gate 的 Accepted Risk 指出：离线邮箱为进程内存存储，节点重启后消息会丢失。  
本任务目标是在不破坏现有 `/api/v1/*` 与协议约束的前提下，将消息邮箱改为本地持久化。

## 2. 实现

### 2.1 新增持久化仓储

- 新增：`packages/node/src/storage/message-repository.ts`
  - `mailbox_envelopes`：持久化 envelope 与幂等签名
  - `mailbox_retractions`：持久化 provisional 撤回记录
  - `mailbox_sequences`：持久化每会话序号（重启后续号不回退）

### 2.2 MessageService 接入持久化

- 修改：`packages/node/src/services/message-service.ts`
  - 支持注入 `MessageRepository`
  - `send/pull/cleanup/retract/listRetracted` 全链路优先走仓储
  - 保留无仓储时内存模式，兼容脚本和轻量测试场景

### 2.3 节点运行时接线

- 修改：`packages/node/src/app.ts`
  - 新增 `mailbox.sqlite`
  - `MessageService` 默认注入持久化仓储

### 2.4 发布后验收脚本

- 新增：`packages/node/scripts/run-phase6-mailbox-persistence-check.ts`
  - 重启后消息可读
  - 序号持续递增
  - provisional 在 reorg 后撤回
  - TTL 清理在持久化仓储中生效

## 3. 结果

- 构建：`docs/implementation/phase-6/logs/2026-03-03-p6-node-build.txt`
- 单测：`docs/implementation/phase-6/logs/2026-03-03-p6-node-test.txt`
- 验收脚本：`docs/implementation/phase-6/logs/2026-03-03-p6-mailbox-persistence-check-run.txt`
- 清单：`docs/implementation/phase-6/manifests/2026-03-03-p6-mailbox-persistence-check.json`
- 结论：`PASS`

## 4. 下一步

进入 `TA-P6-002`：设计并落地多实例共享 mailbox state（SQLite 单机 -> 可扩展存储）。
