# TA-P15-004 Console 多平台架构与共享核心层冻结（2026-03-03）

- Task ID：TA-P15-004
- 阶段：Phase 15
- 状态：DONE
- 负责人角色：Frontend + DX + Backend

## 1. 目标

冻结 TelAgent 客户端在 Web/PWA/Desktop/Mobile 四端的统一架构，明确共享核心层职责、平台适配边界、依赖方向和演进路径，为 `TA-P15-005`（离线同步与冲突策略）提供稳定骨架。

## 2. 范围与约束

1. 范围覆盖：Web、PWA、Desktop、Mobile 的架构划分与能力矩阵。
2. 协议边界：客户端仅消费 `/api/v1/*`。
3. 身份边界：仅支持 `did:claw:*`；DID hash 统一 `keccak256(utf8(did))`（复用共享协议工具实现）。
4. 错误边界：统一 RFC7807（`application/problem+json`）解析模型。
5. 产品边界：继续以核心 P2P 聊天应用为主，不引入运维面板能力回潮。

## 3. 目标平台矩阵（冻结版）

| 平台 | 定位 | 首发范围 | 关键能力 |
| --- | --- | --- | --- |
| Web | 主交付端 | 会话/消息/群组/身份/设置全链路 | 浏览器环境、最低部署成本 |
| PWA | Web 增强端 | 基于 Web 增量启用 | 安装、缓存、通知、弱网可用 |
| Desktop | 重度用户端 | 在 Web 主流程之上增强本地能力 | 本地文件、托盘、后台常驻 |
| Mobile | 移动触达端 | 功能等价优先，交互适配其次 | 推送、前后台切换、弱网恢复 |

## 4. 分层架构（Shared Core First）

## 4.1 分层定义

1. `app-shell`（平台应用壳）
2. `ui-kit`（设计系统组件层）
3. `domain`（会话/消息/群组/身份状态机）
4. `core-sdk`（API client + DTO + 错误模型）
5. `sync-engine`（离线队列、重放、冲突解决，下一任务细化）
6. `platform-adapter`（Web/PWA/Desktop/Mobile 差异封装）

## 4.2 依赖方向（必须遵守）

`app-shell -> ui-kit -> domain -> core-sdk -> platform-adapter`

约束：

1. `domain` 禁止直接依赖具体平台 API（如 `window`, `ServiceWorker`, `Electron`, `ReactNative`）。
2. `ui-kit` 禁止直接发起网络请求。
3. 平台特有能力必须通过 `platform-adapter` 接口注入。

## 4.3 推荐包结构（目录冻结建议）

1. `packages/console`：Console 壳层与页面编排。
2. `packages/client-core`：`core-sdk + domain + shared types`。
3. `packages/client-sync`：离线与同步引擎（在 `TA-P15-005` 落地）。
4. `packages/client-platform`：`web/pwa/desktop/mobile` 适配实现。
5. `packages/ui` 或 `packages/console/src/ui-kit`：跨端可复用组件与 token。

## 5. 平台适配边界（Adapter Contract）

## 5.1 必需适配接口

| 接口 | 责任 | 备注 |
| --- | --- | --- |
| `StorageAdapter` | 键值与对象存储读写 | Web=IndexedDB, Desktop=local db, Mobile=secure storage |
| `NetworkAdapter` | 在线状态、重试策略、超时 | 屏蔽平台网络栈差异 |
| `NotificationAdapter` | 本地通知与权限状态 | Web Notification / Desktop / Mobile Push |
| `CryptoAdapter` | 随机数、摘要、密钥存取封装 | DID hash 与消息签名工具统一入口 |
| `LifecycleAdapter` | 前后台、可见性、恢复事件 | 支撑重连与补拉 |
| `FileAdapter` | 文件选择、预览、上传源管理 | 附件体验跨端对齐 |

## 5.2 能力降级规则

1. 缺失通知权限时，降级为会话内 banner，不阻断主流程。
2. 缺失后台运行能力时，回前台触发补拉，不伪造实时在线语义。
3. 缺失文件系统能力时，仅暴露平台可支持的附件范围。

## 6. API 与错误契约统一策略

1. API base 路径只允许 `/api/v1/*`。
2. `core-sdk` 统一实现：
   - 请求 envelope；
   - 响应 DTO 正规化；
   - RFC7807 错误解码（`type/title/status/detail/code/instance`）。
3. `domain` 仅消费已正规化数据，不直接解析 HTTP 细节。
4. revoked DID / 会话隔离在 `domain` 层统一建模，平台壳只负责呈现。

## 7. 身份与安全一致性

1. DID 输入校验统一为 `did:claw:*`（共享校验器）。
2. DID hash 统一通过共享函数计算：`keccak256(utf8(did))`。
3. 敏感字段（token、密钥引用、控制地址）在日志与埋点层统一脱敏。
4. 客户端错误上报只上传最小必要上下文，禁止泄露明文消息内容。

## 8. 运行时与发布拓扑

## 8.1 运行时策略

1. Web/PWA 共用主代码线，通过构建标识启用 Service Worker 与离线能力。
2. Desktop 通过宿主桥接 `platform-adapter`，禁止业务层直连宿主 API。
3. Mobile 保持 domain/core 同构，交互层按移动端范式单独适配。

## 8.2 发布策略

1. 单仓分包发布：`core` 先行版本，`platform shell` 随后发布。
2. 版本相容规则：`platform shell` 只能依赖当前或向后兼容的 `core-sdk`。
3. 回滚粒度：优先回滚壳层；核心协议层回滚需经过兼容性校验。

## 9. 从当前 Console 的迁移路径

1. 当前单体 `packages/console` 分离为 `app-shell + client-core 接口`。
2. 将 API 调用与错误处理下沉到 `core-sdk`。
3. 将会话/消息/群组状态机抽离为 `domain`。
4. 在不改变现有用户路径前提下引入 `platform-adapter` 抽象。
5. 为 `TA-P15-005` 预留 `sync-engine` 接口（队列、幂等、冲突回调）。

## 10. TA-P15-004 验收清单

- [x] Web/PWA/Desktop/Mobile 目标矩阵冻结。
- [x] 共享核心层与平台适配边界冻结。
- [x] API、DID、DID hash、RFC7807 约束写入架构层。
- [x] 依赖方向与目录建议可直接指导后续实现拆包。
- [x] Console build/test 任务级证据归档。
- [x] README/WBS/Iteration Board 状态同步完成。

## 11. 证据

- 任务文档：`docs/implementation/phase-15/ta-p15-004-console-multi-platform-architecture-2026-03-03.md`
- Console 构建日志：`docs/implementation/phase-15/logs/2026-03-03-p15-console-build-ta-p15-004.txt`
- Console 测试日志：`docs/implementation/phase-15/logs/2026-03-03-p15-console-test-ta-p15-004.txt`
- 专项检查日志：`docs/implementation/phase-15/logs/2026-03-03-p15-platform-architecture-check-run.txt`
- 机读清单：`docs/implementation/phase-15/manifests/2026-03-03-p15-platform-architecture-check.json`

## 12. 结论

- `TA-P15-004`：PASS
- 下一步：进入 `TA-P15-005`（离线同步、冲突策略与性能预算）。
