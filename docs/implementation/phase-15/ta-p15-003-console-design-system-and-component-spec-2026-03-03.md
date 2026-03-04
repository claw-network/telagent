# TA-P15-003 Console 设计系统与组件规范冻结（2026-03-03）

- Task ID：TA-P15-003
- 阶段：Phase 15
- 状态：DONE
- 负责人角色：Frontend + Design

## 1. 目标

冻结 TelAgent Console 的设计系统基线，明确 token、组件分层、交互状态和可访问性规范，为 `TA-P15-004`（多平台架构）提供统一 UI 合约。

## 2. 范围与约束

1. 范围聚焦：服务于 P2P 聊天主应用（会话、消息、群组、身份、设置），不引入独立运维面板。
2. API 边界：前端交互只映射 `/api/v1/*`。
3. DID 边界：身份输入和显示仅支持 `did:claw:*`。
4. 错误语义：错误展示必须支持 RFC7807（`application/problem+json`）字段映射。
5. 输出性质：本任务冻结规范和契约，不在本任务实现全量多平台 UI 代码。

## 3. 设计原则（冻结版）

1. 主路径优先：任何页面优先服务 `create -> invite -> accept -> send -> pull`。
2. 状态可见：链上确认、发送失败、会话隔离必须具备显式状态表达。
3. 结构一致：全局视觉语言、控件行为、反馈方式保持一致，不因页面而变化。
4. 可访问优先：键盘可达、语义化标签、颜色对比满足基线。
5. 渐进增强：先保证 Web 主端一致性，再向 PWA/Desktop/Mobile 迁移。

## 4. Token 体系（Design Tokens）

## 4.1 色彩语义 Token

| Token | 值 | 用途 |
| --- | --- | --- |
| `--ta-color-bg-canvas` | `#f4f1e8` | 应用背景基底 |
| `--ta-color-surface-primary` | `#ffffff` | 面板主表面 |
| `--ta-color-surface-elevated` | `rgba(255, 255, 255, 0.85)` | 浮层/半透明容器 |
| `--ta-color-border-default` | `#d7cfba` | 组件边框 |
| `--ta-color-text-primary` | `#1f2a37` | 主文本 |
| `--ta-color-text-secondary` | `#5b6472` | 次文本 |
| `--ta-color-accent-primary` | `#e28743` | 主强调（按钮/焦点） |
| `--ta-color-accent-secondary` | `#2c7a74` | 次强调（标签/状态） |
| `--ta-color-status-danger` | `#a23e48` | 错误/阻断状态 |
| `--ta-color-status-warning` | `#c27a2c` | 预警状态 |
| `--ta-color-status-success` | `#1f7a4f` | 成功状态 |

## 4.2 字体与排版 Token

| Token | 值 | 用途 |
| --- | --- | --- |
| `--ta-font-sans` | `'Manrope', 'Segoe UI', sans-serif` | 主体 UI |
| `--ta-font-mono` | `'IBM Plex Mono', monospace` | 技术字段、哈希、DID |
| `--ta-font-size-xs` | `12px` | 辅助说明 |
| `--ta-font-size-sm` | `14px` | 正文次级 |
| `--ta-font-size-md` | `16px` | 正文默认 |
| `--ta-font-size-lg` | `18px` | 小标题 |
| `--ta-font-size-xl` | `32px` | 页面主标题 |
| `--ta-line-height-tight` | `1.2` | 标题 |
| `--ta-line-height-base` | `1.5` | 正文 |

## 4.3 间距、圆角、阴影与动效 Token

| 类别 | Token | 值 |
| --- | --- | --- |
| 间距 | `--ta-space-1` ~ `--ta-space-8` | `4px` 到 `32px`（4px 递增） |
| 圆角 | `--ta-radius-sm/md/lg/xl` | `8px/11px/14px/18px` |
| 阴影 | `--ta-shadow-panel` | `0 14px 36px rgba(77, 58, 24, 0.12)` |
| 动效时长 | `--ta-motion-fast/base/slow` | `120ms/200ms/320ms` |
| 动效曲线 | `--ta-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |

## 4.4 Token 管理规则

1. 禁止在组件中写死颜色、阴影、字体和动效时长，必须引用 token。
2. token 命名统一 `--ta-<category>-<semantic>-<level>`。
3. token 分层为 `foundation`（原子）和 `semantic`（语义）两级。
4. 新增 token 需在设计文档和实现代码同时登记，避免“文档/代码漂移”。

## 5. 组件分层规范（Component Architecture）

## 5.1 L0 原子组件（Primitives）

| 组件 | 职责 | 关键状态 |
| --- | --- | --- |
| `TaButton` | 主/次/危险按钮 | default, hover, focus, disabled, loading |
| `TaInput` | 单行输入 | default, focus, error, disabled |
| `TaSelect` | 选项选择 | default, open, selected, disabled |
| `TaTextarea` | 多行输入 | default, focus, error, disabled |
| `TaCard` | 信息容器 | default, elevated |
| `TaBadge` | 轻量状态标识 | neutral, success, warning, danger |
| `TaBanner` | 全宽状态提示 | info, warning, error |

## 5.2 L1 领域组件（Domain Components）

| 组件 | 所属域 | 输入/输出契约 |
| --- | --- | --- |
| `SessionListPanel` | 会话 | 输入会话摘要数组，输出会话切换事件 |
| `ConversationTimeline` | 消息 | 输入消息列表 + 游标，输出加载更多事件 |
| `MessageComposer` | 消息 | 输入会话状态，输出发送请求事件 |
| `GroupLifecyclePanel` | 群组 | 输入群状态，输出 create/invite/accept 操作 |
| `IdentityStatusPanel` | 身份 | 输入 DID 与状态，输出恢复/重试动作 |
| `DiagnosticsSnapshotPanel` | 设置 | 输入只读指标，输出刷新动作 |

## 5.3 L2 页面级编排组件（Page Compositions）

1. `SessionsPage`：`SessionListPanel + ConversationTimeline + MessageComposer`
2. `GroupsPage`：`GroupLifecyclePanel + MembersTable + ChainStatePanel`
3. `IdentityPage`：`IdentityStatusPanel + WalletBalanceCard`
4. `SettingsPage`：`NodeConnectionForm + DiagnosticsSnapshotPanel`

## 6. 状态与反馈语义

## 6.1 消息发送状态机（UI 视角）

`draft -> sending -> sent | failed | isolated`

- `failed`：可重试，需保留最后 payload 快照。
- `isolated`：revoked DID 或会话隔离，禁止继续发送并展示恢复引导。

## 6.2 连接与系统状态

1. `ready`：主路径全部可交互。
2. `degraded`：只读降级，保留刷新入口。
3. `offline`：仅本地可读与草稿缓存（具体离线策略在 `TA-P15-005`）。

## 6.3 错误展示规范（RFC7807）

1. 统一解析：`type/title/status/detail/code/instance`。
2. `VALIDATION`：字段级提示。
3. `FORBIDDEN`：权限阻断提示。
4. `UNPROCESSABLE`：状态冲突或隔离态提示。
5. 未知错误：统一 fallback 文案 + 可复制错误上下文。

## 7. 可访问性（A11y）基线

1. 颜色对比：正文与背景至少 `4.5:1`。
2. 键盘可达：所有主操作支持 `Tab/Shift+Tab/Enter/Space`。
3. 焦点可见：统一 `2px` focus ring（基于 `--ta-color-accent-primary`）。
4. 语义标签：表单输入必须包含 `label` 或 `aria-label`。
5. 动效降级：支持 `prefers-reduced-motion`，禁用非必要动画。
6. 告警播报：关键错误使用 `aria-live="polite"`。

## 8. 响应式与跨端适配约束

| 断点 | 布局策略 |
| --- | --- |
| `>=1200px` | 三栏（会话/消息/状态）或双栏（列表+详情） |
| `768px~1199px` | 双栏，次要诊断信息折叠 |
| `<768px` | 单栏路由切换，底部操作区固定 |

补充约束：

1. 最小可点击区域：`44px x 44px`。
2. 长 DID/hash 默认截断显示，支持一键复制完整值。
3. 附件预览优先保障不遮挡发送主操作。

## 9. TA-P15-003 验收清单

- [x] 设计原则、token 体系、组件分层规范完整输出。
- [x] 错误语义与 RFC7807 映射明确。
- [x] revoked DID 隔离态在组件层有明确表现约束。
- [x] 可访问性与响应式基线已冻结。
- [x] Console build/test 证据已归档。
- [x] README/WBS/Iteration Board 状态同步完成。

## 10. 证据

- 任务文档：`docs/implementation/phase-15/ta-p15-003-console-design-system-and-component-spec-2026-03-03.md`
- Console 构建日志：`docs/implementation/phase-15/logs/2026-03-03-p15-console-build.txt`
- Console 测试日志：`docs/implementation/phase-15/logs/2026-03-03-p15-console-test.txt`
- 专项检查日志：`docs/implementation/phase-15/logs/2026-03-03-p15-design-system-check-run.txt`
- 机读清单：`docs/implementation/phase-15/manifests/2026-03-03-p15-design-system-check.json`

## 11. 结论

- `TA-P15-003`：PASS
- 下一步：进入 `TA-P15-004`（多平台架构与共享核心层设计）。
