# TA-P15-002 Console 功能域与 IA 冻结（2026-03-03）

- Task ID：TA-P15-002
- 阶段：Phase 15
- 状态：DONE
- 负责人角色：Frontend + Product + Backend

## 1. 目标

冻结 Console 的功能域边界、信息架构（IA）、关键用户旅程和 API 映射，作为 `TA-P15-003` ~ `TA-P15-006` 的实现输入。

## 2. 边界与约束

1. 产品定位：Console 为主端，优先覆盖 P2P 聊天主流程，不回退到运维面板导向 UI。
2. API 约束：仅允许映射 `/api/v1/*` 路径。
3. DID 约束：客户端输入和展示仅接受 `did:claw:*`。
4. 错误约束：失败响应统一按 RFC7807（`application/problem+json`）处理并落 UI 语义。
5. Phase 边界：本任务只冻结“做什么、如何组织、怎么验收”，不做设计系统和多平台实现细节。

## 3. 功能域矩阵（冻结版）

| 功能域 | P0 能力（本期必须） | P1 能力（后续增强） | 核心 API（均为 `/api/v1/*`） | 验收口径 |
| --- | --- | --- | --- | --- |
| 会话域（Sessions） | 会话列表、最近消息摘要、未读计数、会话跳转 | 会话筛选、归档、置顶 | `GET /messages/pull?conversation_id=...`, `GET /messages/retracted` | 能稳定进入指定会话，分页游标不漂移 |
| 消息域（Messages） | 文本/图片/文件发送，发送状态反馈，失败重试 | 草稿、撤回态富文本渲染 | `POST /messages`, `GET /messages/pull`, `POST /attachments/init-upload`, `POST /attachments/complete-upload` | 发送链路闭环，可区分成功/失败/隔离态 |
| 群组域（Groups） | 创建群组、邀请、接受、成员列表、链上状态 | 成员批量管理、群设置模板 | `POST /groups`, `POST /groups/:groupId/invites`, `POST /groups/:groupId/invites/:inviteId/accept`, `GET /groups/:groupId/members`, `GET /groups/:groupId/chain-state` | create->invite->accept 主路径可视化且可追踪 |
| 身份与安全（Identity） | 自身份展示、目标 DID 解析、revoked DID 隔离提示 | 密钥健康评分、自动恢复建议 | `GET /identities/self`, `GET /identities/:did`, `GET /wallets/:did/gas-balance`, `POST /node/revocations`（仅测试/灰度） | revoked DID 触发后，消息发送与会话状态反馈一致 |
| 设置与诊断（Settings） | 节点连接配置、只读健康快照入口 | 多节点配置模板、导出策略配置 | `GET /node`, `GET /node/metrics`, `GET /node/audit-snapshot` | 不引入运维操作写接口，保留只读诊断能力 |

## 4. IA（信息架构）冻结

### 4.1 顶层导航

1. `Sessions`：会话聚合入口（默认首页）。
2. `Groups`：群组生命周期管理。
3. `Identity`：本地 DID 与安全状态。
4. `Settings`：节点连接、只读诊断、客户端偏好。

### 4.2 页面结构

1. `/sessions`
2. `/sessions/:conversationId`
3. `/groups`
4. `/groups/:groupId`
5. `/identity/self`
6. `/settings/node`
7. `/settings/diagnostics`

### 4.3 状态流转（页面级）

1. `Bootstrapping` -> `Ready`：节点可连通且 `GET /api/v1/identities/self` 成功。
2. `Ready` -> `Degraded`：接口超时或 5xx，UI 降级为只读提示 + 重试入口。
3. `Ready` -> `Isolated`：会话命中 revoked DID 隔离或发送返回 `422 UNPROCESSABLE`。
4. `Isolated` -> `Ready`：用户切换到未隔离会话或身份恢复后重新拉取成功。

## 5. 关键用户旅程（含失败/恢复）

## 5.1 群聊主路径（Happy Path）

1. 在 `Groups` 创建群：`POST /api/v1/groups`。
2. 发起邀请：`POST /api/v1/groups/:groupId/invites`。
3. 被邀请方接受：`POST /api/v1/groups/:groupId/invites/:inviteId/accept`。
4. 进入会话页发送消息：`POST /api/v1/messages`。
5. 拉取消息流：`GET /api/v1/messages/pull`。

验收：完整链路无需跳出 Console，活动记录可对齐服务端审计信息。

## 5.2 revoked DID 隔离路径（Failure + Recovery）

1. 已建立会话后触发撤销事件（灰度/测试）：`POST /api/v1/node/revocations`。
2. 会话进入隔离态，消息发送返回 RFC7807 错误（`application/problem+json`）。
3. UI 明确展示“身份已撤销/会话隔离”，禁用发送输入并给出恢复指引。
4. 用户切换到非隔离会话，或完成身份恢复后重新拉取，状态回到 `Ready`。

验收：隔离态阻断准确、提示可理解、恢复路径明确。

## 5.3 输入错误路径（Validation）

1. 用户输入非法 DID（非 `did:claw:*`）或格式错误 payload。
2. 服务返回 RFC7807 `400 VALIDATION`。
3. UI 在字段级显示错误，不进入“未知异常”分支。

验收：错误分类清晰，不吞错，不误导为系统故障。

## 6. API 映射与错误语义

| 页面/动作 | API | 成功语义 | 失败语义（RFC7807） |
| --- | --- | --- | --- |
| 启动加载身份 | `GET /api/v1/identities/self` | 返回 DID、didHash、controller | `5xx` 时进入 `Degraded` 并允许重试 |
| 创建群组 | `POST /api/v1/groups` | `201 + group/txHash` | `400 VALIDATION` 显示输入修复建议 |
| 邀请/接受 | `POST /api/v1/groups/:groupId/invites`, `POST /api/v1/groups/:groupId/invites/:inviteId/accept` | `201` 返回链上事务信息 | `403 FORBIDDEN` 或 `422 UNPROCESSABLE` 提示权限/状态冲突 |
| 发送消息 | `POST /api/v1/messages` | `201 + envelope` | `422 UNPROCESSABLE`（revoked DID/隔离）禁用发送并提示 |
| 拉取消息 | `GET /api/v1/messages/pull` | `200 + items + cursor` | `400 VALIDATION`（非法游标）回退到首屏重拉 |
| 上传附件 | `POST /api/v1/attachments/init-upload`, `POST /api/v1/attachments/complete-upload` | 初始化与完成闭环 | `400 VALIDATION`（checksum/manifest）提示重传 |
| 只读诊断 | `GET /api/v1/node/metrics`, `GET /api/v1/node/audit-snapshot` | 输出系统快照用于支持分析 | `5xx` 时仅标记“诊断不可用”，不影响聊天主流程 |

## 7. TA-P15-002 验收清单

- [x] 功能域覆盖会话、消息、群组、身份、安全与设置。
- [x] IA 输出包含顶层导航、页面结构、状态流转。
- [x] 用户旅程覆盖 happy path 与 failure/recovery（含 revoked DID 隔离）。
- [x] API 映射仅使用 `/api/v1/*`。
- [x] DID 与错误语义约束显式写入（`did:claw:*` + RFC7807）。
- [x] 证据链包含任务文档、构建/测试日志、专项检查日志、manifest。

## 8. 证据

- 任务文档：`docs/implementation/phase-15/ta-p15-002-console-functional-ia-freeze-2026-03-03.md`
- Node 构建日志：`docs/implementation/phase-15/logs/2026-03-03-p15-node-build.txt`
- Node 测试日志：`docs/implementation/phase-15/logs/2026-03-03-p15-node-test.txt`
- IA 专项检查日志：`docs/implementation/phase-15/logs/2026-03-03-p15-functional-ia-check-run.txt`
- 机读清单：`docs/implementation/phase-15/manifests/2026-03-03-p15-functional-ia-check.json`

## 9. 结论

- `TA-P15-002`：PASS
- 下一步：进入 `TA-P15-003`（设计系统与组件规范）。
