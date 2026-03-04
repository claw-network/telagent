# TelAgent v1（中文说明）

TelAgent 是一个面向 Agent-to-Agent 私密通信场景的后端系统，当前已与 ClawNet 做深度集成。
其核心目标是同时满足：

- **私密性**：消息正文链下加密传输
- **可验证性**：群组生命周期链上确权
- **可互操作性**：统一 API 前缀、响应 envelope、错误模型

英文版请参见 `README.md`。

## 项目价值与定位

TelAgent 关注“私密聊天 + 链上确定性”：

- **身份模型固定**：仅允许 `did:claw:*`
- **DID 哈希规则固定**：`keccak256(utf8(did))`
- **群组权属上链**：创建、邀请、接受、移除具备链上事实来源
- **聊天正文链下**：保证吞吐和隐私，不把正文写入链上
- **投递语义明确**：至少一次投递 + 会话内有序（`conversationId + seq`）

## 当前已落地能力

当前代码基线已覆盖 ClawNet 深度集成主路径：

- ClawNet Node 自动发现 / 可选托管启动
- Session 授权机制（`/api/v1/session/*`）
- Nonce 管理器（所有 ClawNet 写操作经统一分配与重试）
- ClawNet 代理 API（`/api/v1/clawnet/*`）
- API 前缀严格限制为 `/api/v1/*`
- 成功响应 envelope 与 RFC7807 错误统一
- 直聊/群聊的 sequencer 归属规则已确定并实现
- 联邦出站队列持久化（SQLite/Postgres）+ 重试退避
- 跨节点提交路径（`/api/v1/federation/messages/submit`）已接入

## 仓库结构

- `packages/contracts`：Solidity 合约、测试、部署脚本
- `packages/protocol`：共享类型、schema、错误码、DID 工具
- `packages/node`：节点运行时（API、服务层、索引器、联邦模块）
- `packages/console`：运维控制台
- `docs`：设计文档、RFC、实施计划、任务拆解、Gate 记录

## API 契约（强约束）

- **路径前缀**：仅 `/api/v1/*`
- **成功响应**：
  - 单资源：`{ data, links? }`
  - 集合：`{ data, meta, links }`
- **错误响应**：RFC7807，`Content-Type: application/problem+json`

主要端点分组如下：

- **节点与运维**
  - `GET /api/v1/node`
  - `GET /api/v1/node/metrics`
- **身份与群组**
  - `GET /api/v1/identities/self`
  - `GET /api/v1/identities/{did}`
  - `POST /api/v1/groups`
  - `GET /api/v1/groups/{groupId}`
  - `GET /api/v1/groups/{groupId}/members`
  - `POST /api/v1/groups/{groupId}/invites`
  - `POST /api/v1/groups/{groupId}/invites/{inviteId}/accept`
  - `DELETE /api/v1/groups/{groupId}/members/{memberDid}`
  - `GET /api/v1/groups/{groupId}/chain-state`
- **消息、附件、联邦**
  - `POST /api/v1/messages`
  - `GET /api/v1/messages/pull`
  - `POST /api/v1/attachments/init-upload`
  - `POST /api/v1/attachments/complete-upload`
  - `POST /api/v1/federation/envelopes`
  - `POST /api/v1/federation/messages/submit`
  - `POST /api/v1/federation/group-state/sync`
  - `POST /api/v1/federation/receipts`
  - `GET /api/v1/federation/node-info`
- **ClawNet 深度集成**
  - `POST /api/v1/session/unlock`
  - `POST /api/v1/session/lock`
  - `GET /api/v1/session`
  - `GET /api/v1/clawnet/health`
  - `GET /api/v1/clawnet/wallet/*`
  - `GET /api/v1/clawnet/identity/*`
  - `GET /api/v1/clawnet/market/*`
  - `POST /api/v1/clawnet/wallet/*`（需要 Session Token）
  - `POST /api/v1/clawnet/market/*`（需要 Session Token）
  - `POST /api/v1/clawnet/reputation/review`（需要 Session Token）
  - `POST /api/v1/clawnet/contracts`（需要 Session Token）

## 运行环境要求

- Node.js：`>=22 <25`
- pnpm：`10.18.1`

## 快速开始

安装并验证：

```bash
pnpm install
pnpm -r build
pnpm -r test
```

启动节点：

```bash
pnpm --filter @telagent/node start
```

默认 API 地址：

`http://127.0.0.1:9528/api/v1`

## 最小环境变量

启动 `@telagent/node` 至少需要：

```bash
export TELAGENT_CHAIN_RPC_URL=http://127.0.0.1:8545
export TELAGENT_GROUP_REGISTRY_CONTRACT=0x3333333333333333333333333333333333333333
export TELAGENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

常用 ClawNet 配置：

- `TELAGENT_HOME`（默认 `~/.telagent`）
- `TELAGENT_CLAWNET_NODE_URL`
- `TELAGENT_CLAWNET_PASSPHRASE`
- `TELAGENT_CLAWNET_AUTO_DISCOVER`（默认 `true`）
- `TELAGENT_CLAWNET_AUTO_START`（默认 `true`）
- `TELAGENT_CLAWNET_API_KEY`
- `TELAGENT_CLAWNET_TIMEOUT_MS`（默认 `30000`）

## 已废弃环境变量（设置后会拒绝启动）

- `TELAGENT_DATA_DIR`（请改用 `TELAGENT_HOME`）
- `TELAGENT_SELF_DID`（改为运行时从 ClawNet Node 获取）
- `TELAGENT_IDENTITY_CONTRACT`（改为通过 ClawNet SDK 解析）
- `TELAGENT_TOKEN_CONTRACT`（改为通过 ClawNet SDK 查询）

## 文档阅读顺序

建议按以下顺序阅读：

1. `docs/README.md`
2. `docs/design/telagent-v1-design.md`
3. `docs/design/clawnet-deep-integration-rfc.md`
4. `docs/implementation/clawnet-integration-implementation-steps.md`
5. `docs/implementation/gates/README.md`

## 本地自检清单

```bash
pnpm --filter @telagent/protocol build
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
```

## 双节点云端联调（烟雾测试）

用于验证“跨节点自动投递闭环”是否可用：

1）先配置两台节点的 URL、DID、域名：

```bash
export TELAGENT_NODE_A_URL=https://node-a.example.com
export TELAGENT_NODE_A_DID=did:claw:zNodeA
export TELAGENT_NODE_A_DOMAIN=node-a.example.com
export TELAGENT_NODE_B_URL=https://node-b.example.com
export TELAGENT_NODE_B_DID=did:claw:zNodeB
export TELAGENT_NODE_B_DOMAIN=node-b.example.com
```

2）执行检查脚本：

```bash
pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts
```

脚本会输出并落盘报告到：
`docs/implementation/phase-17/cross-node-chat-check-report.json`
