# TA-P15-005 Console 离线同步、冲突策略与性能预算冻结（2026-03-03）

- Task ID：TA-P15-005
- 阶段：Phase 15
- 状态：DONE
- 负责人角色：Frontend + Backend + QA

## 1. 目标

冻结客户端离线同步方案，明确离线队列、重放机制、冲突解决策略和性能预算，为 `TA-P15-006` 质量门禁提供可验证输入。

## 2. 范围与约束

1. 范围覆盖：Web/PWA/Desktop/Mobile 的离线行为一致性策略。
2. API 边界：仅允许 `/api/v1/*`。
3. DID 边界：仅允许 `did:claw:*`；DID hash 统一 `keccak256(utf8(did))`。
4. 错误边界：离线恢复后的服务端错误按 RFC7807（`application/problem+json`）统一处理。
5. 任务边界：本任务冻结策略与预算，不在本任务实现完整离线引擎代码。

## 3. 离线同步模型（Offline Sync Model）

## 3.1 本地数据分层

1. `durable-store`：消息索引、会话快照、待发送队列（持久化）。
2. `volatile-cache`：当前会话视图、临时排序结果（内存级）。
3. `checkpoint-store`：每会话同步游标、最近成功回放位点。

## 3.2 队列对象模型（Queue Item）

| 字段 | 说明 |
| --- | --- |
| `queueId` | 本地唯一标识 |
| `operation` | `SEND_MESSAGE` / `UPLOAD_INIT` / `UPLOAD_COMPLETE` / `SYNC_PULL` |
| `conversationId` | 关联会话（如适用） |
| `idempotencyKey` | 幂等键（复用 envelopeId 或 upload objectKey） |
| `payload` | 发送负载快照（脱敏存储） |
| `attempt` | 当前重试次数 |
| `nextRetryAtMs` | 下一次重试时间 |
| `createdAtMs` | 入队时间 |
| `expiresAtMs` | 过期时间（默认 24h） |

## 3.3 状态机（Queue State）

`pending -> dispatching -> acknowledged | retry_wait | dead_letter`

规则：

1. 网络离线时仅允许 `pending` 入队，不执行 `dispatching`。
2. 幂等冲突（同 `idempotencyKey`）合并为单任务，避免重复发送。
3. 超过最大重试次数进入 `dead_letter`，必须可观测和可人工触发重放。

## 4. 重放机制（Replay Strategy）

## 4.1 触发条件

1. 网络从离线转在线（`offline -> online`）。
2. 应用从后台恢复前台。
3. 用户主动点击“立即同步”。

## 4.2 重放顺序

1. 先附件元操作：`UPLOAD_INIT` -> `UPLOAD_COMPLETE`。
2. 再消息发送：`SEND_MESSAGE`。
3. 最后拉取补齐：`SYNC_PULL`。

## 4.3 重放并发控制

1. 同会话串行、跨会话有限并发（默认 3）。
2. 同 `idempotencyKey` 永远单飞（single-flight）。
3. 拉取操作不阻塞发送确认，但需要在发送成功后做增量补拉。

## 4.4 重试退避

1. 基础退避：`2s, 4s, 8s, 16s...`（上限 60s）。
2. 抖动：`±20%` 随机抖动避免雪崩。
3. `429/503` 优先遵守服务端建议重试窗口。

## 5. 冲突解决策略（Conflict Resolution）

## 5.1 冲突类型

| 类型 | 示例 | 处理策略 |
| --- | --- | --- |
| 幂等冲突 | 相同 `envelopeId` 重复发送 | 视为成功回放，去重后更新本地状态 |
| 顺序冲突 | 本地消息顺序与服务端 seq 不一致 | 以服务端 seq 为准重排，并保留本地映射表 |
| 状态冲突 | 会话已隔离或 group 状态不允许发送 | 标记 `UNPROCESSABLE`，进入用户可见待处理 |
| 权限冲突 | direct 会话非参与方发送 | 标记 `FORBIDDEN`，停止自动重放该条任务 |
| 内容冲突 | 同 `idempotencyKey` 不同 payload | 进入 `dead_letter`，要求人工确认 |

## 5.2 冲突决策优先级

1. 协议正确性优先（服务端事实优先于本地猜测）。
2. 不丢消息优先于绝对实时（允许短时排序回摆）。
3. 自动化可恢复优先，无法自动恢复则明确升级到人工动作。

## 5.3 用户可见策略

1. `retry_wait`：显示“等待重试”状态与预计时间。
2. `dead_letter`：显示“需要处理”，支持重试/放弃/导出诊断。
3. `UNPROCESSABLE/FORBIDDEN`：按 RFC7807 code 映射具体引导文案。

## 6. 性能预算（Performance Budget）

## 6.1 启动与交互预算

| 指标 | 预算 |
| --- | --- |
| 首屏可交互（Web） | `<= 2.5s`（常规网络） |
| 离线恢复后首条可见消息 | `<= 1.5s` |
| 发送按钮到本地回执 | `<= 120ms` |
| 队列重放调度间隔抖动 | `<= 100ms` |

## 6.2 同步吞吐预算

| 指标 | 预算 |
| --- | --- |
| 单会话补拉吞吐 | `>= 50 msg/s` |
| 并发会话重放数 | 默认 3，峰值 5 |
| 队列扫描周期 | `<= 3s` |
| 冲突检测附加开销 | `<= 10% CPU`（相对基线） |

## 6.3 资源预算

| 资源 | 预算 |
| --- | --- |
| Web 内存（聊天主流程） | `< 250MB` |
| 本地离线队列默认上限 | `10,000` 项 |
| 单条 payload 持久化上限 | `128KB`（超出走附件） |
| dead-letter 保留时长 | 默认 7 天 |

## 7. API 与错误语义映射（离线场景）

1. `POST /api/v1/messages`：失败按 `FORBIDDEN/UNPROCESSABLE/VALIDATION` 分类。
2. `POST /api/v1/attachments/init-upload` 与 `complete-upload`：checksum/manifest 失败转入冲突处理。
3. `GET /api/v1/messages/pull`：恢复在线后做游标补齐，避免本地视图漂移。
4. 所有错误统一按 RFC7807 解码并记录 `code + instance` 便于诊断。

## 8. 可观测与审计字段

1. 队列指标：`queueDepth`, `replayRate`, `deadLetterCount`, `avgRetryDelayMs`。
2. 冲突指标：`idempotencyConflictCount`, `orderingConflictCount`, `forbiddenConflictCount`。
3. 体验指标：`offlineRecoveryLatencyMs`, `sendAckLatencyMs`。
4. 审计要求：日志中 DID 仅保留脱敏片段，完整 DID hash 使用 `keccak256(utf8(did))`。

## 9. TA-P15-005 验收清单

- [x] 离线队列模型、状态机、重放顺序冻结。
- [x] 冲突分类与决策规则冻结。
- [x] 性能预算（启动、吞吐、资源）冻结。
- [x] `/api/v1/*`、`did:claw:*`、DID hash、RFC7807 约束显式写入。
- [x] 任务级 Console build/test 证据归档。
- [x] README/WBS/Iteration Board 状态同步完成。

## 10. 证据

- 任务文档：`docs/implementation/phase-15/ta-p15-005-console-offline-sync-conflict-performance-2026-03-03.md`
- Console 构建日志：`docs/implementation/phase-15/logs/2026-03-03-p15-console-build-ta-p15-005.txt`
- Console 测试日志：`docs/implementation/phase-15/logs/2026-03-03-p15-console-test-ta-p15-005.txt`
- 专项检查日志：`docs/implementation/phase-15/logs/2026-03-03-p15-offline-sync-check-run.txt`
- 机读清单：`docs/implementation/phase-15/manifests/2026-03-03-p15-offline-sync-check.json`

## 11. 结论

- `TA-P15-005`：PASS
- 下一步：进入 `TA-P15-006`（客户端质量体系与发布门禁）。
