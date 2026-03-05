# TelAgent WebApp 实施任务拆解

- 文档版本：v1.0
- 最后更新：2026-03-05
- 架构文档：[webapp-architecture.md](../design/webapp-architecture.md)
- 目标：将 WebApp 架构设计拆解为可执行、可跟踪、可验收的任务清单

---

## 1. 使用说明

- **执行顺序**：按 `Phase W1 → Phase W6` 串行推进，每个 Phase 有明确 Gate。
- **状态标记**：`[ ]` 未开始 / `[x]` 已完成。
- **估算单位**：人日（PD）。
- **依赖格式**：`-` 表示无依赖；多个依赖用逗号分隔。
- **前置**：本文档的 Phase W1-W6 可与主线 Phase 17+ 并行，但 Node 端新增 API 需优先排期。

## 2. 里程碑依赖图

```
                       ┌─────────────────────────────────────────┐
                       │           Node 端前置任务                │
                       │  WN-001 会话列表 API                     │
                       │  WN-002 Owner 权限 API                   │
                       │  WN-003 会话私密标记 API                  │
                       │  WN-004 明文消息视图 API（待定）           │
                       └────┬──────────┬──────────┬──────────────┘
                            │          │          │
                            ▼          │          │
┌──────────────┐     ┌──────────────┐  │   ┌──────────────┐
│ Phase W1     │────►│ Phase W2     │  │   │ Phase W4     │
│ 骨架与连接   │     │ 完整消息渲染 │  │   │ 介入者模式   │◄─┐
│ Observer MVP │     └──────┬───────┘  │   └──────┬───────┘  │
└──────────────┘            │          │          │          │
                            ▼          │          ▼          │
                     ┌──────────────┐  │   ┌──────────────┐  │
                     │ Phase W3     │  │   │ Phase W5     │  │
                     │ 群组与联系人 │──┘   │ ClawNet 集成 │  │
                     └──────┬───────┘      └──────┬───────┘  │
                            │                     │          │
                            └──────────┬──────────┘          │
                                       ▼                     │
                                ┌──────────────┐             │
                                │ Phase W6     │─────────────┘
                                │ 私密对话     │
                                │ 与打磨       │
                                └──────────────┘
```

---

## 3. Node 端前置任务

> 以下 API 是 WebApp 运行的前提，需在 `@telagent/node` 中实现。

### WN-001 — 会话列表 API `GET /api/v1/conversations`

- [ ] **WN-001-A** 设计 `conversations` 存储表结构（SQLite / Postgres）（0.5 PD）
  - 输出：DDL 与迁移脚本
  - 验收：表可创建，字段覆盖 `ConversationSummary` 全部属性
- [ ] **WN-001-B** 实现 `ConversationRepository`（1 PD）
  - 依赖：WN-001-A
  - 输出：CRUD + 按 `lastMessageAtMs` 排序的分页查询
  - 验收：单元测试全绿
- [ ] **WN-001-C** 在 `MessageService` 中维护会话摘要（1 PD）
  - 依赖：WN-001-B
  - 输出：发送/接收消息时自动 upsert 会话记录
  - 验收：发消息后会话列表可查，`lastMessagePreview` 与 `unreadCount` 正确
- [x] **WN-001-D**（2026-03-05） 实现 `GET /api/v1/conversations` 路由（0.5 PD）
  - 依赖：WN-001-C
  - 输出：分页列表 API，响应符合 `ApiListEnvelope<ConversationSummary>`
  - 验收：契约测试通过，envelope + pagination 结构正确

### WN-002 — Owner 权限 API `GET /api/v1/owner/permissions`

- [x] **WN-002-A**（2026-03-05） 设计 Owner 权限数据模型与配置存储（0.5 PD）
  - 输出：`OwnerPermissions` 类型定义（补入 `@telagent/protocol`） + 配置文件 schema
  - 验收：类型可在 SDK 和 Node 间共享
- [x] **WN-002-B**（2026-03-05） 实现 `OwnerPermissionService`（1 PD）
  - 依赖：WN-002-A
  - 输出：从配置/存储加载权限，支持 `getPermissions()` 方法
  - 验收：单元测试覆盖 observer / intervener / scope 组合
- [x] **WN-002-C**（2026-03-05） 实现 `GET /api/v1/owner/permissions` 路由（0.5 PD）
  - 依赖：WN-002-B
  - 输出：路由处理器
  - 验收：契约测试通过，响应符合 `ApiDataEnvelope<OwnerPermissions>`
- [ ] **WN-002-D** 在写操作路由中接入权限守卫中间件（1 PD）
  - 依赖：WN-002-B
  - 输出：消息发送、群组管理、ClawNet 写操作均校验 Owner 权限
  - 验收：Observer token 调用写 API 返回 403 + RFC7807

### WN-003 — 会话私密标记 API

- [x] **WN-003-A**（2026-03-05） 在 `conversations` 表新增 `private` 字段（0.5 PD）
  - 依赖：WN-001-A
  - 输出：DDL 变更
  - 验收：字段默认 false，可更新
- [x] **WN-003-B**（2026-03-05） 实现 `PUT /api/v1/conversations/:conversationId/privacy` 路由（0.5 PD）
  - 依赖：WN-003-A
  - 输出：仅 Agent 自身可调用（非 Owner），设置/取消私密标记
  - 验收：Owner token 调用返回 403；Agent token 可正常更新
- [x] **WN-003-C**（2026-03-05） 在 `GET /api/v1/conversations` 中返回 `private` 字段（0.5 PD）
  - 依赖：WN-003-A, WN-001-D
  - 输出：会话列表包含 `private: boolean`
  - 验收：私密会话 `lastMessagePreview` 返回 null
- [x] **WN-003-D**（2026-03-05） 在 `GET /api/v1/owner/permissions` 中返回 `privateConversations` 数组（0.5 PD）
  - 依赖：WN-003-A, WN-002-C
  - 输出：权限 API 包含私密会话 ID 列表
  - 验收：与实际数据库标记一致

### WN-004 — 消息解密视图（开放问题，需决策）

- [ ] **WN-004-A** 明确 Owner 消息访问方案（0.5 PD）
  - 方案一：Owner 持有独立解密密钥，Agent 双密封
  - 方案二：Node 提供 `GET /api/v1/messages/view` 已解密视图 API
  - 方案三：Owner 仅可查看元数据（sender、time、type），无法看内容
  - 输出：决策记录（ADR）
  - 验收：方案确定，WebApp 端可据此实现
- [ ] **WN-004-B** 按决策实现对应 API 或密钥分发机制（2 PD）
  - 依赖：WN-004-A
  - 输出：Owner 可访问的消息内容（或元数据 only）API
  - 验收：WebApp 可获取并渲染消息

### WN-005 — SDK 扩展

- [x] **WN-005-A**（2026-03-05） `@telagent/sdk` 新增 `listConversations()` 方法（0.5 PD）
  - 依赖：WN-001-D
  - 输出：SDK 方法，签名与现有风格一致
  - 验收：返回 `ApiListEnvelope<ConversationSummary>`
- [x] **WN-005-B**（2026-03-05） `@telagent/sdk` 新增 `getOwnerPermissions()` 方法（0.5 PD）
  - 依赖：WN-002-C
  - 输出：SDK 方法
  - 验收：返回 `ApiDataEnvelope<OwnerPermissions>`
- [x] **WN-005-C**（2026-03-05） `@telagent/sdk` 新增 ClawNet 代理方法的完整封装（1 PD）
  - 输出：`getWalletBalance()`, `getWalletHistory()`, `transfer()`, `createEscrow()`, `releaseEscrow()`, `listTasks()`, `searchMarkets()`, `publishTask()`, `bid()`, `acceptBid()`, `submitReview()`, `createServiceContract()`
  - 验收：所有 ClawNet 路由均有对应 SDK 方法

---

## 4. WebApp 分阶段任务清单

### Phase W1 — 骨架与连接（Observer MVP）

> 目标：项目从零搭建到可连接 Node、展示会话列表、只读浏览消息。
> 依赖：WN-001（会话列表 API）或降级方案
> 预估总计：14 PD

#### W1.1 项目初始化

- [x] **W1-001**（2026-03-05） 创建 `packages/webapp` 包骨架（0.5 PD）
  - 输出：`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`
  - 验收：`pnpm dev` 可启动空白页，`pnpm typecheck` 通过
- [x] **W1-002**（2026-03-05） 配置 Tailwind CSS v4（0.5 PD）
  - 依赖：W1-001
  - 输出：`@tailwindcss/vite` 插件接入，`src/globals.css` 引入 Tailwind
  - 验收：Tailwind 类名生效，`pnpm build` 产物包含 CSS
- [x] **W1-003**（2026-03-05） 初始化 shadcn/ui（0.5 PD）
  - 依赖：W1-002
  - 输出：`components.json`, `src/lib/utils.ts`（`cn()` 函数），CSS 变量主题
  - 验收：`npx shadcn@latest add button` 可正常生成组件到 `src/components/ui/`
- [x] **W1-004**（2026-03-05） 添加核心 shadcn/ui 基础组件（0.5 PD）
  - 依赖：W1-003
  - 输出：`Button`, `Input`, `Avatar`, `Badge`, `Card`, `ScrollArea`, `Skeleton`, `Separator`, `Tooltip`
  - 验收：组件文件存在于 `src/components/ui/`，无类型错误
- [x] **W1-005**（2026-03-05） 引入 Zustand 与 Lucide React（0.5 PD）
  - 依赖：W1-001
  - 输出：`zustand`, `lucide-react` 加入依赖
  - 验收：可在组件中正常使用
- [x] **W1-005a**（2026-03-05） 配置 i18n 国际化（0.5 PD）
  - 依赖：W1-001
  - 输出：安装 `react-i18next` + `i18next`，创建 `src/i18n/index.ts` 初始化配置（fallbackLng: 'en'），创建 `src/i18n/locales/en.json` 和 `src/i18n/locales/zh.json` 翻译资源文件
  - 验收：`useTranslation()` hook 可正常获取 `t()` 函数，`i18next.changeLanguage('zh')` 可切换中文
- [x] **W1-005b**（2026-03-05） 实现 `LanguageSwitcher` 组件（0.5 PD）
  - 依赖：W1-004, W1-005a
  - 新增 shadcn/ui 组件：`DropdownMenu`
  - 输出：`src/components/shared/LanguageSwitcher.tsx`，下拉菜单切换中/英，切换时同步 `i18next.changeLanguage()` 与 `useUIStore.locale`，语言偏好持久化到 localStorage
  - 验收：点击切换后页面文本实时更新，刷新后语言保持
- [x] **W1-005c**（2026-03-05） 配置 deep/light 双主题（0.5 PD）
  - 依赖：W1-003
  - 输出：在 `globals.css` 中定义 `:root`（浅色）和 `.dark`（深色）CSS 变量，`<html>` 默认添加 `class="dark"`，`useUIStore.theme` 默认值 `'dark'` 并持久化到 localStorage
  - 验收：页面默认以深色主题渲染，shadcn/ui 组件在 dark/light 模式下颜色正确
- [x] **W1-005d**（2026-03-05） 实现 `ThemeSwitcher` 组件（0.5 PD）
  - 依赖：W1-004, W1-005c
  - 新增 shadcn/ui 组件：`DropdownMenu`（如尚未添加）
  - 输出：`src/components/shared/ThemeSwitcher.tsx`，切换时同步更新 `document.documentElement.classList` 和 `useUIStore.theme`，放置于 Toolbar（Desktop）和 Settings 页（Mobile）
  - 验收：点击切换后页面主题实时变化，刷新后主题保持

#### W1.2 路由与布局壳

- [x] **W1-006**（2026-03-05） 配置 React Router 7 路由表（0.5 PD）
  - 依赖：W1-001
  - 输出：`src/app.tsx` 路由定义，含 `/connect`, `/chat`, `/chat/:conversationId`, `/settings`
  - 验收：URL 切换页面正常渲染
- [x] **W1-007**（2026-03-05） 实现 `ResponsiveShell` 组件（1 PD）
  - 依赖：W1-004, W1-006
  - 输出：根据 viewport 切换 Desktop（三栏）/ Mobile（Tab 栈）布局
  - 验收：调整浏览器宽度可观察布局切换，断点 768px
- [x] **W1-008**（2026-03-05） 实现 `DesktopLayout` — PC/Pad 三栏壳（1 PD）
  - 依赖：W1-007
  - 新增 shadcn/ui 组件：`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`
  - 输出：Sidebar（240-320px）+ Chat Area（flex-1）+ Detail Panel（280-360px，可折叠）
  - 验收：三栏可拉拽调宽，Detail Panel 可收起/展开
- [x] **W1-009**（2026-03-05） 实现 `MobileLayout` — 手机 Tab 栈壳（1 PD）
  - 依赖：W1-007
  - 输出：底部 Tab 导航（聊天/市场/钱包/设置）+ 内容区 + 栈式页面跳转
  - 验收：Tab 切换正常，点击会话 push 到聊天页，返回按钮 pop
- [x] **W1-010**（2026-03-05） 实现 `StatusBar` 底部状态栏（Desktop）（0.5 PD）
  - 依赖：W1-008
  - 输出：连接状态、轮询状态、链同步状态指示器
  - 验收：状态栏在 Desktop 底部可见

#### W1.3 连接与身份

- [x] **W1-011**（2026-03-05） 实现 `useConnectionStore`（0.5 PD）
  - 依赖：W1-005
  - 输出：Zustand store，字段：`nodeUrl`, `accessToken`, `status`, `sdk`
  - 验收：持久化到 localStorage，刷新后恢复
- [x] **W1-012**（2026-03-05） 实现 `ConnectForm` + `ConnectPage`（1 PD）
  - 依赖：W1-004, W1-011, W1-005b
  - 新增 shadcn/ui 组件：`Form`, `Label`
  - 输出：Node URL 输入 → 调用 `GET /api/v1/node` 验证 → 连接成功创建 SDK 实例；右上角嵌入 `LanguageSwitcher` 组件
  - 验收：输入有效 URL 连接成功后跳转 `/chat`；无效 URL 显示错误提示；语言切换器可用且切换后表单文本实时更新
- [x] **W1-013**（2026-03-05） 实现 `useIdentityStore` + 身份加载（0.5 PD）
  - 依赖：W1-011
  - 输出：连接成功后自动调用 `getSelfIdentity()`，存储 Agent DID、Profile
  - 验收：连接后 store 中有 Agent 身份信息

#### W1.4 会话列表

- [x] **W1-014**（2026-03-05） 实现 `useConversationStore`（0.5 PD）
  - 依赖：W1-005
  - 输出：会话列表、排序方法、选中态、搜索过滤
  - 验收：store actions 单元测试通过
- [x] **W1-015**（2026-03-05） 实现 `ConversationList` + `ConversationItem` 组件（1 PD）
  - 依赖：W1-004, W1-014
  - 输出：会话列表 UI，含搜索框、DM/Group 混合排列、最后消息时间、未读计数 Badge
  - 验收：渲染 mock 数据时 UI 正确；点击条目更新选中态
- [x] **W1-016**（2026-03-05） 对接 `listConversations()` API（0.5 PD）
  - 依赖：W1-014, WN-005-A（或降级方案）
  - 输出：从 Node 拉取真实会话列表
  - 验收：会话列表展示实际数据（降级方案：从 pullMessages 聚合）
- [x] **W1-017**（2026-03-05） 实现 `DidAvatar` 共享组件（0.5 PD）
  - 依赖：W1-004
  - 输出：基于 DID 字符串生成确定性颜色 + 首字母的 Avatar
  - 验收：同一 DID 始终生成相同头像

#### W1.5 消息列表（只读）

- [x] **W1-018**（2026-03-05） 实现 `useMessageStore`（0.5 PD）
  - 依赖：W1-005
  - 输出：当前会话消息列表、cursor、加载状态、去重逻辑
  - 验收：store actions 单元测试通过，`envelopeId` 去重正确
- [x] **W1-019**（2026-03-05） 实现 `ChatHeader` 组件（0.5 PD）
  - 依赖：W1-004
  - 输出：显示对方名称/群组名、在线状态、info 按钮
  - 验收：直聊显示对方 DID 缩写，群聊显示群组名
- [x] **W1-020**（2026-03-05） 实现 `MessageList` 组件（基础版，无虚拟滚动）（1 PD）
  - 依赖：W1-004, W1-018
  - 输出：消息列表 + 时间分组分隔线 + `ScrollArea` 自动滚动到底部
  - 验收：消息按 seq 排序，新消息自动滚动到底部
- [x] **W1-021**（2026-03-05） 实现 `TextBubble` + `ControlNotice` 气泡组件（0.5 PD）
  - 依赖：W1-004
  - 输出：文本消息左右气泡（根据 sender）、系统消息居中灰色
  - 验收：self 消息靠右深色，peer 消息靠左浅色
- [x] **W1-022**（2026-03-05） 实现 `MessageInput` 组件（Observer 只读态）（0.5 PD）
  - 依赖：W1-004
  - 新增 shadcn/ui 组件：`Textarea`
  - 输出：禁用态输入区 + "You are in observer mode" 提示
  - 验收：输入框 disabled，提示文字可见

#### W1.6 消息轮询

- [x] **W1-023**（2026-03-05） 实现 `usePollMessages` Hook（1 PD）
  - 依赖：W1-018
  - 输出：定时轮询逻辑（活跃 3s / 空闲 15s），`visibilitychange` 暂停/恢复
  - 验收：打开会话后自动开始 poll，切换 tab 后暂停，切回后恢复
- [x] **W1-024**（2026-03-05） 全局 conversation 列表轮询（0.5 PD）
  - 依赖：W1-014, W1-023
  - 输出：后台定时刷新会话列表（15s 间隔）
  - 验收：新消息到达后会话列表排序更新

#### W1.7 Phase W1 Gate

- [x] **W1-025**（2026-03-05） Phase W1 Gate 评审（0.5 PD）
  - 依赖：W1-001 ~ W1-024 全部完成
  - 验收标准：
    - `pnpm dev` 启动正常
    - `pnpm typecheck` 无错误
    - `pnpm build` 产物可用
    - 可连接到 Node 并展示会话列表
    - 可点击会话查看消息流（只读）
    - Desktop 三栏 / Mobile Tab 布局切换正常
    - 消息轮询机制工作正常
    - i18n 支持：Connect 页可切换中/英，切换后所有静态文本实时更新，刷新后语言偏好保持
    - 主题支持：默认深色，深色/浅色切换正常，切换后持久化，刷新后保持

---

### Phase W2 — 完整消息渲染

> 目标：支持所有 ContentType 的消息气泡、附件预览、虚拟滚动。
> 依赖：Phase W1
> 预估总计：8 PD

#### W2.1 扩展消息气泡

- [x] **W2-001**（2026-03-05） 实现 `MessageBubble` 分发组件（0.5 PD）
  - 依赖：W1-021
  - 输出：根据 `contentType` 分发到对应气泡组件
  - 验收：未知类型显示 fallback 气泡
- [x] **W2-002**（2026-03-05） 实现 `ImageBubble` 组件（0.5 PD）
  - 新增 shadcn/ui 组件：`Dialog`（图片放大预览）
  - 输出：缩略图 + 点击弹出大图查看器
  - 验收：图片懒加载，大图支持缩放
- [x] **W2-003**（2026-03-05） 实现 `FileBubble` 组件（0.5 PD）
  - 输出：文件卡片（文件名、大小、类型图标、下载按钮）
  - 验收：点击下载可触发浏览器下载
- [x] **W2-004**（2026-03-05） 实现 `IdentityCard` 气泡（0.5 PD）
  - 输出：DID 身份卡片（头像、公钥摘要、信誉评分、能力标签）
  - 验收：字段与 `IdentityCardPayload` 对齐
- [x] **W2-005**（2026-03-05） 实现 `TransferRequestCard` + `TransferReceiptCard` 气泡（0.5 PD）
  - 输出：转账请求（金额、备注、状态）+ 转账回执（txHash、确认状态）
  - 验收：Observer 模式下操作按钮隐藏
- [x] **W2-006**（2026-03-05） 实现 `TaskListingCard` + `TaskBidCard` 气泡（0.5 PD）
  - 输出：任务发布卡片（标题、定价、截止时间）+ 竞标通知卡片
  - 验收：字段与 payload schema 对齐
- [x] **W2-007**（2026-03-05） 实现 `EscrowCreatedCard` + `EscrowReleasedCard` 气泡（0.5 PD）
  - 输出：托管创建/释放通知（金额、参与方、状态、txHash）
  - 验收：字段完整
- [x] **W2-008**（2026-03-05） 实现 `MilestoneUpdateCard` + `ReviewCard` 气泡（0.5 PD）
  - 输出：里程碑进度（进度条、阶段描述）+ 评价卡片（星级、评论）
  - 验收：`ReputationStars` 子组件复用

#### W2.2 消息时间分组

- [x] **W2-009**（2026-03-05） 实现消息时间分组逻辑（0.5 PD）
  - 输出：按日期插入分隔线（今天 / 昨天 / 具体日期）
  - 验收：跨天消息之间有日期标签

#### W2.3 虚拟滚动

- [x] **W2-010**（2026-03-05） 引入虚拟滚动方案（1 PD）
  - 方案：`@tanstack/react-virtual` 或等效轻量库
  - 输出：`MessageList` 升级为虚拟滚动
  - 验收：1000+ 条消息渲染流畅，FPS ≥ 55

#### W2.4 Provisional 消息标记

- [x] **W2-011**（2026-03-05） 实现 provisional 消息 UI 样式（0.5 PD）
  - 输出：`provisional: true` 的消息用虚线边框标记
  - 验收：虚线边框可见，retracted 后消息从列表消失
- [x] **W2-012**（2026-03-05） 实现 retracted 消息 toast 通知（0.5 PD）
  - 新增 shadcn/ui 组件：`Sonner`（toast）
  - 输出：消息被撤回时弹出 toast 通知
  - 验收：toast 显示被撤回消息的 conversationId

#### W2.5 附件预览

- [x] **W2-013**（2026-03-05） 实现附件元信息展示（0.5 PD）
  - 输出：带 `attachmentManifestHash` 的消息显示附件指示器
  - 验收：附件图标 + hash 摘要可见

#### W2.6 Phase W2 Gate

- [x] **W2-014**（2026-03-05） Phase W2 Gate 评审（0.5 PD）
  - 依赖：W2-001 ~ W2-013 全部完成
  - 验收标准：
    - 全部 12 种 ContentType 气泡组件渲染正确
    - 虚拟滚动在 1000+ 消息场景下流畅
    - provisional 消息有视觉区分
    - 消息时间分组正确

---

### Phase W3 — 群组与联系人

> 目标：联系人详情面板、群组详情面板（成员 + 链上状态）、DID 身份卡片。
> 依赖：Phase W1, Phase W2
> 预估总计：8.5 PD

#### W3.1 联系人详情

- [x] **W3-001**（2026-03-05） 实现 `useContactStore`（0.5 PD）
  - 输出：DID → Identity 缓存映射、resolve 方法
  - 验收：重复 resolve 不发请求（缓存命中）
- [x] **W3-002**（2026-03-05） 实现 `ContactDetail` 面板（1.5 PD）
  - 新增 shadcn/ui 组件：`HoverCard`, `Tabs`
  - 输出：联系人详情面板，Tab 内含：
    - 基本信息（DID、公钥摘要、Controller 状态）
    - ClawNet Profile（如有）
    - Reputation 信誉（评分、评价数）
  - 验收：Desktop 显示在右侧 Detail Panel；Mobile 为独立页面
- [x] **W3-003**（2026-03-05） 实现 `DidLabel` 共享组件（0.5 PD）
  - 输出：DID 缩写显示（`did:claw:0xab...ef`），hover 显示完整 DID，点击复制
  - 验收：hover tooltip、复制到剪贴板正常

#### W3.2 群组详情

- [x] **W3-004**（2026-03-05） 实现 `useGroupStore`（0.5 PD）
  - 输出：群组信息缓存、成员列表、链上状态
  - 验收：store actions 单元测试通过
- [x] **W3-005**（2026-03-05） 实现 `GroupDetail` 面板（1 PD）
  - 输出：群组详情面板，展示：群名、Domain、创建者 DID、状态
  - 验收：Desktop Detail Panel + Mobile 独立页 均正常
- [x] **W3-006**（2026-03-05） 实现 `GroupMemberList` 组件（1 PD）
  - 新增 shadcn/ui 组件：`Table`
  - 输出：成员列表，每行含 DID、状态徽章、加入时间
  - 验收：支持 view 切换（all / pending / finalized），分页正常
- [x] **W3-007**（2026-03-05） 实现 `GroupChainState` 组件（0.5 PD）
  - 输出：链上状态展示（GroupState、txHash、blockNumber、updatedAt）
  - 验收：txHash 可点击（占位链接到区块浏览器）
- [x] **W3-008**（2026-03-05） 实现 `MemberStateBadge` + `ChainStateBadge` 共享组件（0.5 PD）
  - 输出：成员状态（PENDING=黄 / FINALIZED=绿 / REMOVED=红）、群组状态徽章
  - 验收：颜色与状态映射正确

#### W3.3 Detail Panel 集成

- [x] **W3-009**（2026-03-05） 实现 `useUIStore` Detail Panel 开关逻辑（0.5 PD）
  - 依赖：W1-008
  - 输出：点击 ChatHeader info 按钮 → 展开 Detail Panel → 根据 conversationType 渲染 ContactDetail 或 GroupDetail
  - 验收：Desktop 右侧面板联动；Mobile 跳转到独立 info 页
- [x] **W3-010**（2026-03-05） 实现 `ReputationStars` 共享组件（0.5 PD）
  - 输出：星级展示（1-5 颗星 + 分数）
  - 验收：分数精确到一位小数

#### W3.4 Phase W3 Gate

- [x] **W3-011**（2026-03-05） Phase W3 Gate 评审（0.5 PD）
  - 依赖：W3-001 ~ W3-010 全部完成
  - 验收标准：
    - 直聊点击 info → 联系人详情面板展示正确
    - 群聊点击 info → 群组详情 + 成员列表 + 链上状态展示正确
    - Desktop / Mobile 双端详情面板均可用
    - DID 相关共享组件（Avatar、Label、Badge）复用无误

---

### Phase W4 — 介入者模式

> 目标：权限查询 + 模式切换 + 消息发送 + 群组管理操作。
> 依赖：Phase W1, WN-002（Owner 权限 API）
> 预估总计：10 PD

#### W4.1 权限系统

- [x] **W4-001**（2026-03-05） 实现 `usePermissionStore`（0.5 PD）
  - 输出：mode、interventionScopes、privateConversations
  - 验收：store 初始化后从 API 加载权限
- [x] **W4-002**（2026-03-05） 实现 `useGuardedAction` Hook（0.5 PD）
  - 依赖：W4-001
  - 输出：`canExecute` 布尔值 + `reason` 提示语
  - 验收：Observer → 全部 canExecute=false；Intervener + 匹配 scope → canExecute=true
- [x] **W4-003**（2026-03-05） 实现 `useConversationAccess` Hook（0.5 PD）
  - 依赖：W4-001
  - 输出：`isPrivate`, `canView`, `canIntervene`
  - 验收：私密会话 canView=false, canIntervene=false
- [x] **W4-004**（2026-03-05） 实现 `ModeBadge` 组件（0.5 PD）
  - 输出：在 Toolbar 显示当前模式（Observer 灰色 / Intervener 蓝色徽章）
  - 验收：模式徽章随权限数据变化

#### W4.2 消息发送

- [x] **W4-005**（2026-03-05） 升级 `MessageInput` 为可输入态（1 PD）
  - 依赖：W1-022, W4-002
  - 输出：Intervener + 普通会话 → 输入框 enabled + 发送按钮 + 附件按钮
  - 验收：Observer / 私密会话保持禁用态
- [x] **W4-006**（2026-03-05） 实现 Optimistic Update 逻辑（1 PD）
  - 依赖：W4-005, W1-018
  - 输出：发送 → 插入 pending 消息（灰色 + spinner）→ 成功替换为正式 Envelope → 失败标记 failed + 重试按钮
  - 验收：发送、成功、失败三种状态 UI 正确
- [x] **W4-007**（2026-03-05） 实现附件上传流程（init + complete）（1 PD）
  - 依赖：W4-005
  - 输出：选择文件 → `initAttachmentUpload` → 上传 → `completeAttachmentUpload` → 附带 `attachmentManifestHash` 发消息
  - 验收：附件发送后接收方可见附件卡片

#### W4.3 群组管理操作

- [x] **W4-008**（2026-03-05） 实现 `CreateGroupDialog`（1 PD）
  - 新增 shadcn/ui 组件：`Dialog`, `Select`
  - 依赖：W4-002
  - 输出：创建群组对话框（groupDomain、domainProofHash、initialMlsStateHash）
  - 验收：Intervener + manage_groups scope → 可创建；Observer → 按钮隐藏
- [x] **W4-009**（2026-03-05） 实现 `InviteMemberDialog`（0.5 PD）
  - 依赖：W4-002
  - 输出：邀请成员对话框（输入 DID、确认）
  - 验收：邀请成功后成员列表刷新
- [x] **W4-010**（2026-03-05） 实现群组接受邀请操作（0.5 PD）
  - 依赖：W4-002
  - 输出：待接受邀请列表 + 接受按钮
  - 验收：接受后成员状态更新
- [x] **W4-011**（2026-03-05） 实现群组移除成员操作（0.5 PD）
  - 依赖：W4-002
  - 输出：成员列表中的移除按钮 + 确认对话框
  - 新增 shadcn/ui 组件：`AlertDialog`
  - 验收：移除后成员列表刷新

#### W4.4 联系人管理

- [x] **W4-012**（2026-03-05） 实现 `ContactActions` 组件（0.5 PD）
  - 依赖：W4-002
  - 新增 shadcn/ui 组件：`DropdownMenu`
  - 输出：联系人操作菜单（发起消息、删除联系人）
  - 验收：Observer 模式下操作菜单不显示

#### W4.5 Phase W4 Gate

- [x] **W4-013**（2026-03-05） Phase W4 Gate 评审（0.5 PD）
  - 依赖：W4-001 ~ W4-012 全部完成
  - 验收标准：
    - Observer 模式下所有写操作入口隐藏或禁用
    - Intervener 模式下可发送消息（含 Optimistic Update）
    - 群组创建、邀请、接受、移除操作均可执行
    - 权限守卫覆盖所有写操作入口
    - 附件上传流程完整

---

### Phase W5 — ClawNet 集成

> 目标：钱包页、市场页、Session 管理 UI、所有 ClawNet 写操作。
> 依赖：Phase W4, WN-005-C（SDK ClawNet 方法）
> 预估总计：10.5 PD

#### W5.1 Session 管理

- [x] **W5-001**（2026-03-05） 实现 `useSessionStore`（0.5 PD）
  - 输出：session token、过期时间、scope、状态
  - 验收：token 过期后自动清除
- [x] **W5-002**（2026-03-05） 实现 `UnlockDialog` 组件（1 PD）
  - 新增 shadcn/ui 组件：`Dialog`（复用）
  - 输出：输入 passphrase → 调用 unlock → 获取 session token；可选配置 ttl / scope / maxOperations
  - 验收：解锁成功后写入 store，失败显示错误
- [x] **W5-003**（2026-03-05） 实现 `SessionBadge` 组件（0.5 PD）
  - 输出：Toolbar 显示 session 状态（锁定/已解锁 + 剩余时间）
  - 验收：过期倒计时、点击可 lock/unlock
- [x] **W5-004**（2026-03-05） 实现 Session 自动检查拦截器（0.5 PD）
  - 输出：ClawNet 写操作前检查 session；过期时自动弹出 UnlockDialog
  - 验收：无 session 时执行转账 → 弹出解锁 → 解锁后继续执行

#### W5.2 钱包页

- [x] **W5-005**（2026-03-05） 实现 `useWalletStore`（0.5 PD）
  - 输出：余额、交易历史、Escrow 列表
  - 验收：store actions 单元测试通过
- [x] **W5-006**（2026-03-05） 实现 `BalanceCard` 组件（0.5 PD）
  - 输出：Token 余额 + Native 余额 + Nonce 展示
  - 验收：数据从 `GET /api/v1/clawnet/wallet/balance` 加载
- [x] **W5-007**（2026-03-05） 实现 `TransactionHistory` 组件（1 PD）
  - 输出：交易列表（时间、类型、金额、状态、txHash），支持分页
  - 验收：数据从 `GET /api/v1/clawnet/wallet/history` 加载
- [x] **W5-008**（2026-03-05） 实现 `TransferDialog`（1 PD）
  - 依赖：W5-004
  - 输出：转账对话框（接收方 DID、金额、备注）→ 调用 `POST /api/v1/clawnet/wallet/transfer`
  - 验收：Observer 下隐藏；Intervener + clawnet_transfer scope → 可执行
- [x] **W5-009**（2026-03-05） 实现 `EscrowList` + `EscrowDetail` 组件（1 PD）
  - 输出：托管列表 + 详情页（金额、参与方、释放规则、状态）
  - 验收：可展示托管信息，Intervener 可释放托管

#### W5.3 市场页

- [x] **W5-010**（2026-03-05） 实现 `useMarketStore`（0.5 PD）
  - 输出：任务列表、搜索结果、竞标信息
  - 验收：store actions 单元测试通过
- [x] **W5-011**（2026-03-05） 实现 `TaskList` 组件（1 PD）
  - 新增 shadcn/ui 组件：`Command`（搜索面板）
  - 输出：任务卡片网格/列表 + 搜索 + 筛选
  - 验收：从 `GET /api/v1/clawnet/market/tasks` 加载
- [x] **W5-012**（2026-03-05） 实现 `TaskDetail` + `BidList` 页面（1 PD）
  - 输出：任务详情页（描述、预算、标签、截止时间）+ 竞标列表
  - 验收：路由 `/market/tasks/:taskId` 正常
- [x] **W5-013**（2026-03-05） 实现 `PublishTaskDialog` + `BidDialog`（1 PD）
  - 依赖：W5-004
  - 输出：发布任务 + 竞标 + 接受竞标对话框
  - 验收：Observer 下隐藏；Intervener + clawnet_market scope → 可执行
- [x] **W5-014**（2026-03-05） 实现评价提交功能（0.5 PD）
  - 依赖：W5-004
  - 输出：评价表单（评分 1-5、评论、orderId）→ `POST /api/v1/clawnet/reputation/review`
  - 验收：Intervener + clawnet_reputation scope → 可执行

#### W5.4 Phase W5 Gate

- [x] **W5-015**（2026-03-05） Phase W5 Gate 评审（0.5 PD）
  - 依赖：W5-001 ~ W5-014 全部完成
  - 验收标准：
    - 钱包页展示余额、交易历史、Escrow 列表
    - 市场页展示任务列表，可搜索、可查看详情
    - Session 解锁/锁定流程正常
    - 所有 ClawNet 写操作（转账、托管、发布任务、竞标、评价、服务合约）均可在 Intervener 模式下执行
    - Observer 模式下所有写操作入口不可见

---

### Phase W6 — 私密对话与打磨

> 目标：私密对话毛玻璃遮罩、移动端优化、性能打磨、错误/空状态。
> 依赖：Phase W3, Phase W4, WN-003（私密标记 API）
> 预估总计：8 PD

#### W6.1 私密对话

- [x] **W6-001**（2026-03-05） 在 `usePermissionStore` 中集成 `privateConversations`（0.5 PD）
  - 依赖：W4-001, WN-003-D
  - 输出：从权限 API 获取私密会话列表
  - 验收：store 中 privateConversations 与 API 返回一致
- [x] **W6-002**（2026-03-05） 实现 `PrivacyOverlay` 组件（0.5 PD）
  - 输出：`backdrop-blur-xl` 毛玻璃遮罩 + 锁图标 + 提示文字
  - 验收：覆盖整个聊天区域，不可穿透点击
- [x] **W6-003**（2026-03-05） 在 `ConversationItem` 中显示私密标记（0.5 PD）
  - 输出：锁图标 + `lastMessagePreview` 显示为 `••••••`
  - 验收：私密会话隐藏未读计数
- [x] **W6-004**（2026-03-05） 在 `ChatPage` 中集成私密遮罩逻辑（0.5 PD）
  - 依赖：W6-001, W6-002
  - 输出：打开私密会话 → 渲染 PrivacyOverlay 覆盖消息区 + 隐藏输入区
  - 验收：Observer / Intervener 模式下私密会话均显示遮罩

#### W6.2 聊天主题微调

- [x] **W6-005**（2026-03-05） 自定义聊天主题变量（0.5 PD）
  - 依赖：W1-005c
  - 输出：`--chat-bubble-self`, `--chat-bubble-peer`, `--privacy-overlay` 在 dark/light 模式下精细适配
  - 验收：深色模式气泡不刺眼，浅色模式对比度充足，私密遮罩两种主题下均有效

#### W6.3 空状态与错误处理

- [x] **W6-006**（2026-03-05） 实现 `EmptyState` 共享组件（0.5 PD）
  - 输出：通用空状态占位（图标 + 标题 + 描述 + 可选操作按钮）
  - 验收：会话列表空、消息列表空、搜索无结果均使用
- [x] **W6-007**（2026-03-05） 全局错误处理 + toast 通知（1 PD）
  - 输出：API 错误统一拦截 → RFC7807 ProblemDetail 解析 → toast 展示
  - 新增 shadcn/ui 组件：`Alert`
  - 验收：网络错误、4xx、5xx 均有 toast 提示
- [x] **W6-008**（2026-03-05） 连接断开重连 UI（0.5 PD）
  - 输出：检测到 Node 不可达 → StatusBar 变红 + 弹出重连提示
  - 验收：Node 恢复后自动重连并继续轮询

#### W6.3 移动端优化

- [x] **W6-009**（2026-03-05） 移动端手势优化（1 PD）
  - 输出：聊天页左滑返回、长按消息弹出上下文菜单（Observer 下仅复制）
  - 新增 shadcn/ui 组件：`ContextMenu`
  - 验收：iOS Safari + Android Chrome 手势流畅
- [x] **W6-010**（2026-03-05） 移动端键盘适配（0.5 PD）
  - 输出：输入框聚焦时消息列表自动上推，不被软键盘遮挡
  - 验收：iOS + Android 键盘弹出场景正常

#### W6.4 性能优化

- [x] **W6-011**（2026-03-05） 图片懒加载（0.5 PD）
  - 输出：`ImageBubble` 使用 `IntersectionObserver` 懒加载
  - 验收：不在视口内的图片不发请求
- [x] **W6-012**（2026-03-05） 消息列表 React 渲染优化（0.5 PD）
  - 输出：`MessageBubble` 使用 `React.memo` + 签名 key 避免不必要的 re-render
  - 验收：消息列表更新时仅新消息触发渲染

#### W6.5 Phase W6 Gate

- [x] **W6-013**（2026-03-05） Phase W6 Gate 评审（0.5 PD）
  - 依赖：W6-001 ~ W6-012 全部完成
  - 验收标准：
    - 私密对话显示毛玻璃遮罩，无法查看内容
    - 聊天主题变量在 dark/light 下均适配正常
    - 空状态、错误状态、断连重连均有 UI 反馈
    - 移动端手势/键盘适配无明显问题
    - 1000+ 消息虚拟滚动流畅
    - 全功能回归测试通过

---

## 5. 总工时估算

| Phase | 任务数 | 预估 PD | 前置条件 |
|---|---|---|---|
| Node 前置（WN） | 17 | 12 | 可与 W1 并行 |
| Phase W1 骨架与连接 | 29 | 14 | WN-001 |
| Phase W2 完整消息渲染 | 14 | 8 | W1 |
| Phase W3 群组与联系人 | 11 | 8.5 | W1, W2 |
| Phase W4 介入者模式 | 13 | 10 | W1, WN-002 |
| Phase W5 ClawNet 集成 | 15 | 10.5 | W4, WN-005 |
| Phase W6 私密对话与打磨 | 13 | 8 | W3, W4, WN-003 |
| **合计** | **112** | **71** | |

## 6. 风险登记

| # | 风险 | 影响 | 缓解措施 |
|---|---|---|---|
| R1 | WN-001 会话列表 API 延期 | W1 阻塞 | 优先实现降级方案 B（客户端聚合） |
| R2 | WN-004 消息解密方案未定 | W1 消息内容显示 | 先按元数据 only 方案开发，后续补内容 |
| R3 | shadcn/ui 与 Tailwind v4 兼容性 | W1 样式问题 | 锁定 shadcn/ui 版本，建立样式回归测试 |
| R4 | 轮询性能在大量会话时退化 | W1-W2 用户体验 | 限制会话列表 poll 频率，Phase W6+ 引入 WebSocket |
| R5 | 移动端浏览器兼容性 | W6 移动端问题 | W1 起就在移动端浏览器上测试布局 |
| R6 | Node 端权限 API 设计变更 | W4 适配成本 | WN-002 优先冻结接口，WebApp 侧 mock 先行 |

## 7. 执行规范

1. 每个任务完成后立即勾选 checkbox 并注明日期。
2. 每个 Phase Gate 需全部子任务完成后方可评审。
3. Gate 未通过不得进入下一 Phase。
4. Node 前置任务（WN-*）与 WebApp 任务可并行推进，但 Gate 依赖必须满足。
5. 高优先级缺陷（P0/P1）需在当前 Phase 清零。
