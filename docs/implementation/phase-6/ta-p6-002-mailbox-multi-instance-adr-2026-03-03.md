# TA-P6-002 多实例共享 Mailbox State 方案设计（2026-03-03）

- Task ID：TA-P6-002
- 阶段：Phase 6（发布后改进）
- 状态：DONE
- 负责人角色：Backend Engineer / SRE

## 1. 目标

在 `TA-P6-001` 完成单机持久化后，定义可落地的多实例共享 mailbox state 方案，解决：

1. 多节点并发发送时的 `seq` 单调一致性。
2. 幂等去重和 provisional 撤回在多实例下的一致视图。
3. 平滑迁移路径（不破坏现有 `/api/v1/*` 和协议语义）。

## 2. 方案决策（ADR）

- ADR 编号：`ADR-P6-002`
- 结论：**Mailbox Store 外置到 PostgreSQL（首选）**，SQLite 保留为单机 fallback。

### 2.1 选型对比

| 方案 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| SQLite + 共享文件系统 | 改造小 | 文件锁/网络盘一致性风险高，运维脆弱 | 否 |
| Redis only | 高性能 | 持久化/审计语义不完整，TTL/回溯复杂 | 否 |
| PostgreSQL | 事务语义完整、`UPSERT` 与行级锁可控、易审计 | 需新增连接池和迁移脚本 | 是（首选） |

### 2.2 核心设计

1. `mailbox_sequences` 采用 `SELECT ... FOR UPDATE` 事务递增，保证会话内单调序。  
2. `mailbox_envelopes` 使用 `envelope_id` 主键 + `idempotency_signature` 唯一约束实现幂等。  
3. provisional 撤回使用事务 `DELETE envelope + UPSERT retraction`，保证原子性。  
4. 读模型继续按 `conversationId + seq` 有序读取，保持 API 兼容。  
5. 引入 `store_backend` 配置：`sqlite | postgres`，默认 `sqlite`。

## 3. 迁移与发布策略

1. Phase 6.3（`TA-P6-003`）先实现存储适配层接口与 Postgres 实现。
2. 灰度环境双写校验（SQLite + Postgres）48h，无差异后切换主读写。
3. 预留回滚开关：`TELAGENT_MAILBOX_STORE_BACKEND=sqlite` 可一键回退。

## 4. 验收标准（TA-P6-003 输入）

- 双实例并发发送 10k 次，`seq` 无回退、无重复。
- 去重与 retraction 在双实例下一致。
- 回归现有 Phase 4/5 用例全绿。

## 5. 下一步

进入 `TA-P6-003`：实现 mailbox store adapter 与 Postgres backend。
