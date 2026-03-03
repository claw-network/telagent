# TA-P9-002 联邦协议版本兼容矩阵与拒绝策略（2026-03-03）

- Task ID：TA-P9-002
- 阶段：Phase 9（联邦跨域运行手册与灰度兼容）
- 状态：DONE
- 负责人角色：Backend Engineer / QA

## 1. 目标

实现跨域节点在线升级所需的协议兼容矩阵，保证版本不兼容请求能被确定性拒绝，并保持向后兼容。

## 2. 实现

### 2.1 配置层扩展

- 变更：`packages/node/src/config.ts`
  - `federation.protocolVersion`（默认 `v1`）
  - `federation.supportedProtocolVersions`（默认至少包含 self 版本）
- 变更：`packages/node/src/config.test.ts`
  - 增加 federation 协议默认值与自动补全测试
- 变更：`.env.example`
  - 新增 federation 协议相关示例变量

### 2.2 Federation Service 兼容矩阵

- 变更：`packages/node/src/services/federation-service.ts`
  - 在 `receiveEnvelope/syncGroupState/recordReceipt` 中校验 `protocolVersion`
  - 非兼容版本返回 `UNPROCESSABLE_ENTITY`（RFC7807）
  - 统计：
    - `acceptedWithoutProtocolHint`
    - `acceptedWithProtocolHint`
    - `unsupportedProtocolRejected`
    - `usageByVersion`
  - `nodeInfo` 新增 `compatibility` 输出（协议矩阵 + 计数）

### 2.3 API 接入

- 变更：`packages/node/src/api/routes/federation.ts`
  - 解析协议版本来源：
    - `x-telagent-protocol-version` 头优先
    - body `protocolVersion` 兜底
  - 透传到 service 的 `FederationRequestMeta`

### 2.4 测试补齐

- 变更：`packages/node/src/services/federation-service.test.ts`
  - 新增兼容版本放行测试
  - 新增不兼容版本拒绝测试
- 变更：`packages/node/src/api-contract.test.ts`
  - 新增不兼容协议头返回 `422 + problem+json` 断言

## 3. 证据

- Node build：`docs/implementation/phase-9/logs/2026-03-03-p9-node-build.txt`
- Node test：`docs/implementation/phase-9/logs/2026-03-03-p9-node-test.txt`
- Workspace test：`docs/implementation/phase-9/logs/2026-03-03-p9-workspace-test.txt`

## 4. 结论

- `TA-P9-002`：PASS
- 联邦协议版本兼容矩阵与拒绝策略已可用，兼容升级与风险阻断能力已具备。
