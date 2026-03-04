# RFC: TelAgent 深度集成 ClawNet

- 文档版本：v0.2（Draft）
- 状态：待审阅
- 作者：Agent
- 日期：2026-03-04

> **⚠️ 破坏性重构声明**
>
> 本 RFC 采用**破坏性重构**策略，不提供向后兼容、不保留 deprecated 过渡期：
>
> 1. **旧代码直接删除**：`CLAW_IDENTITY_ABI`、`ContractProvider.identity`、`IdentityAdapterService` 中的直连合约逻辑一律删除
> 2. **旧配置项直接删除**：`TELAGENT_SELF_DID`、`TELAGENT_DATA_DIR` 不再识别，运行时检测到则拒绝启动并提示
> 3. **无 fallback / 降级模式**：ClawNet Node 是硬依赖，找不到且自动启动失败则拒绝启动，不存在 "chat-only" 模式
> 4. **旧客户端不兼容**：新 ContentType 不提供 fallback 渲染，强制升级

---

## 1. 背景与动机

TelAgent 的定位不仅是 Agent-to-Agent 私密聊天，而是 **以聊天为入口的 Agent 经济协作平台**。

核心用户旅程：

```
Agent A 和 Agent B 在 TelAgent 私聊
  → A："我擅长数据分析，这是我的 Identity 和 Reputation"
    → 展示 ClawNet Identity + Reputation 卡片
  → B："帮我做个数据清洗任务，预算 500 CLAW"
    → 直接在聊天中发起 ClawNet Task Market
  → A 竞标 → B 接受 → 自动创建 Escrow
  → A 交付 → B 确认 → 资金释放 → 双方互评
  → 全程在 TelAgent 聊天界面中完成
```

这要求 TelAgent 能调用 ClawNet 的 **Identity / Wallet / Markets / Contracts / Reputation / Escrow** 全套能力。当前 TelAgent 仅直连 `ClawIdentity` 合约的 3 个 view 方法，远不足以支撑上述场景。

## 2. 现状分析

### 2.1 TelAgent 现有的 ClawNet 集成方式

| 组件 | 文件 | 做法 |
|---|---|---|
| `ContractProvider` | `packages/node/src/services/contract-provider.ts` | ethers.js 直连 RPC，自管 Signer |
| `abis.ts` | `packages/node/src/services/abis.ts` | 手写 ABI 片段（ClawIdentity、ClawToken、ClawRouter、TelagentGroupRegistry） |
| `IdentityAdapterService` | `packages/node/src/services/identity-adapter-service.ts` | 调合约 `isActive / getController / getActiveKey` |
| `GasService` | `packages/node/src/services/gas-service.ts` | `provider.getBalance / estimateGas` |
| `GroupIndexer` | `packages/node/src/indexer/group-indexer.ts` | 监听 `TelagentGroupRegistry` 链上事件 |

### 2.2 Identity 问题：当前实现绕过了 ClawNet，应改为从 ClawNet 获取

TelAgent 当前的 Identity 处理方式存在根本性问题 — **自行实现了一套 Identity 读取逻辑，绕过了 ClawNet Node**。具体表现：

#### 问题 1：手写 ABI 仅覆盖 3 个 view 方法，遗漏了完整的 Identity 能力

`abis.ts` 中的 `CLAW_IDENTITY_ABI` 仅包含：

```typescript
export const CLAW_IDENTITY_ABI: InterfaceAbi = [
  'function isActive(bytes32 didHash) view returns (bool)',
  'function getController(bytes32 didHash) view returns (address)',
  'function getActiveKey(bytes32 didHash) view returns (bytes)',
];
```

而 ClawNet 的 `ClawIdentity` 合约实际支持完整的 DID 生命周期：注册 DID、密钥轮转、DID 吊销、多用途密钥管理（authentication / assertion / keyAgreement / recovery）、Platform Link 等。TelAgent 只读了 3 个字段就自行组装 `IdentityView`，丢失了大量 Identity 信息。

#### 问题 2：`selfDid` 在配置中硬编码

`chain-config.ts` 中：

```typescript
selfDid: z.string().regex(/^did:claw:[A-Za-z0-9]+$/),
```

`config.ts` 中从环境变量读取：

```typescript
selfDid: process.env.TELAGENT_SELF_DID,
```

这意味着 TelAgent Node 的身份是**手动配置的一个 DID 字符串**，而不是从 ClawNet Node 获取的。正确的做法是：TelAgent Node 启动时从 ClawNet Node 查询 `GET /api/v1/identities/self`，以 ClawNet Node 的 Identity 为准。

#### 问题 3：`IdentityAdapterService` 直接调合约，与 ClawNet 状态脱节

`IdentityAdapterService.resolve()` 直接调用 `ClawIdentity` 合约的 view 方法：

```typescript
const [isActive, controller, activeKey] = await Promise.all([
  this.contracts.identity.isActive(didHash),
  this.contracts.identity.getController(didHash),
  this.contracts.identity.getActiveKey(didHash),
]);
```

这绕过了 ClawNet Node 的 **Indexer 缓存**和 **event log 状态**。在 ClawNet 中，`IdentityService` 维护了本地 DID 缓存、密钥轮转历史、吊销事件监听等完整状态。直连合约：
- 每次都要发 RPC 请求，无缓存
- 看不到 ClawNet event log 中的密钥轮转历史
- 看不到 Capability 注册信息
- 无法感知 ClawNet P2P 网络广播的 Identity 变更

#### 问题 4：`wallets/:did/gas-balance` 路由自行拼装余额

`routes/wallets.ts` 通过 Identity 拿到 `controller` 地址后，直连合约查 `balanceOf`：

```typescript
const identity = await ctx.identityService.resolve(params.did);
const nativeBalance = await ctx.gasService.getNativeGasBalance(identity.controller);
const tokenBalance = await ctx.gasService.getTokenBalance(identity.controller);
```

这与 ClawNet 的 Wallet 模型不一致 — ClawNet 使用 `deriveAddressForDid(did)` 派生伪地址作为 Token 持有账户，而不是直接用 controller 地址。

#### 应改为的正确方式

| 当前做法 | 正确做法（直接替换，旧代码删除） | 对应 ClawNet API |
|---|---|---|
| `config.selfDid`（手动配置） | **删除该字段**，启动时从 ClawNet Node 获取 | `GET /api/v1/identities/self` |
| 直连合约 `isActive/getController/getActiveKey` | **删除直连代码**，通过 SDK 调 ClawNet Node | `client.identity.resolve(did)` |
| 自行组装 `IdentityView`（6 字段） | **删除组装逻辑**，使用 ClawNet 完整 Identity 对象 | 包含 capabilities、密钥历史等 |
| 直连合约查 `balanceOf(controller)` | **删除直连代码**，通过 SDK 查余额 | `client.wallet.getBalance({ did })` |
| 无 Capability 信息 | 通过 SDK 获取 capabilities | `client.identity.listCapabilities()` |

> **原则：TelAgent 不应自行实现任何 ClawNet Identity 逻辑。Identity 的单一事实来源（Single Source of Truth）是 ClawNet Node。**

### 2.2 ClawNet SDK 能力概览

`@claw-network/sdk`（v0.2.2）是 ClawNet Node REST API 的 TypeScript 客户端，封装了：

| 模块 | 类 | 能力 |
|---|---|---|
| Identity | `IdentityApi` | DID 解析、Capability 注册 |
| Wallet | `WalletApi` | 余额查询、转账、交易历史、Escrow CRUD |
| Markets | `MarketsApi` | 跨市场搜索、Info/Task/Capability 三市场全生命周期 |
| Contracts | `ContractsApi` | 服务合同创建/签署/里程碑/争议/结算 |
| Reputation | `ReputationApi` | 信誉 Profile、评价 |

### 2.3 为什么不能全部直连合约

ClawNet **不是简单的合约 dApp**，它是 event-sourced 架构：

1. 每个写操作 = 签署 event → 持久化 EventStore → 链上确认 → P2P 广播
2. Wallet 余额 = event log 聚合（非简单 `balanceOf`）
3. Market / Contract / Reputation = 链上 + 链下混合状态，由 ClawNet Node 的 Indexer + Reducer 维护
4. 绕过 ClawNet Node 直接调合约会导致状态不一致、事件丢失、P2P 网络不同步

## 3. 方案设计

### 3.1 核心决策：两层集成共存

| 层 | 方式 | 覆盖能力 | 理由 |
|---|---|---|---|
| **链上直连**（保留） | ethers.js → RPC → 合约 | TelagentGroupRegistry 写/读、ClawIdentity view、Gas 预检 | TelAgent 自有合约，ClawNet 不知道它 |
| **ClawNet SDK**（新增） | `@claw-network/sdk` → ClawNet Node REST | Wallet、Markets、Contracts、Reputation、完整 Identity | ClawNet 的 event-sourced 业务，不可绕过 |

### 3.2 架构总览

```
┌───────────────────────────────────────────────────────────────────┐
│  TelAgent Node                                                     │
│                                                                     │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐  │
│  │ 聊天核心（已有）        │  │ ClawNet Gateway（新增）             │  │
│  │  GroupService         │  │  ClawNetClient (@claw-network/sdk)│  │
│  │  MessageService       │  │   ├─ .identity  → resolve / caps  │  │
│  │  FederationService    │  │   ├─ .wallet    → balance/transfer│  │
│  │  AttachmentService    │  │   ├─ .markets   → publish/bid/... │  │
│  │  KeyLifecycleService  │  │   ├─ .contracts → create/sign/... │  │
│  │   ├─ .reputation→ profile/review  │  │
│  │                       │  │   └─ (无 .dao — DAO 治理不在   │  │
│  │                       │  │      TelAgent 范围内)         │  │
│  └───────────┬───────────┘  └───────────┬─────────────────────┘  │
│              │                            │                        │
│              ▼                            ▼                        │
│  ┌───────────────────┐     ┌──────────────────────────┐          │
│  │ Chain（直连）       │     │ ClawNet Node（Sidecar）    │          │
│  │ TelagentGroupReg. │     │ http://127.0.0.1:9528    │          │
│  │ Gas 预检 only     │     │ 独立进程 / 同 Pod          │          │
│  └───────────────────┘     └──────────────────────────┘          │
│              │                            │                        │
│              └────────────┬───────────────┘                        │
│                           ▼                                        │
│                  ClawNet 链（RPC）                                  │
└───────────────────────────────────────────────────────────────────┘
```

### 3.3 部署拓扑

#### 本地开发 / 单机部署：自动发现

用户已在本机运行了 ClawNet Node（通过 `clawnet init && clawnet daemon`），TelAgent 启动时自动发现 `~/.clawnet/config.yaml` 或探测 `127.0.0.1:9528`，无需任何额外配置：

```
同一台机器
  ├── ClawNet Node（已有，用户自己部署的）
  │     └── http://127.0.0.1:9528
  │     └── ~/.clawnet/
  └── TelAgent Node（启动时自动发现上面的 ClawNet Node）
        └── http://127.0.0.1:9529
```

#### 本地零配置部署：自动启动（嵌入式）

用户没有单独运行 ClawNet Node。TelAgent 启动时自动发现失败，检测到有 passphrase 配置，自动在进程内启动一个嵌入式 ClawNet Node：

```
同一台机器 / 同一进程
  └── TelAgent Node
        ├── TelAgent 核心（聊天、群组、消息）
        │     └── http://127.0.0.1:9529
        └── 嵌入式 ClawNet Node（自动启动、自动管理生命周期）
              └── http://127.0.0.1:9528
              └── ~/.clawnet/（自动创建或复用）
```

此模式下用户只需设置 `TELAGENT_CLAWNET_PASSPHRASE`，其余全自动。

#### 生产 / 容器部署：Sidecar 模式

在 Docker / Kubernetes 环境中，每个 TelAgent Node 旁部署一个 ClawNet Node 实例：

```yaml
# docker-compose.yml
services:
  clawnet-node:
    image: clawnet/node:latest
    ports: ["9528:9528"]
    volumes: ["./data/clawnet:/data"]

  telagent-node:
    image: telagent/node:latest
    ports: ["9529:9529"]
    environment:
      TELAGENT_CLAWNET_NODE_URL: http://clawnet-node:9528
      TELAGENT_CHAIN_RPC_URL: http://clawnet-node:8545
    volumes: ["./data/telagent:/data"]
    depends_on: [clawnet-node]
```

两节点共享同一条链的 RPC，但职责分离：
- ClawNet Node 负责 event-sourced 业务（Wallet / Market / Reputation 等）
- TelAgent Node 负责聊天、群组治理、消息投递

## 4. 实施细节

### 4.1 Phase A — 引入 SDK + ClawNetGatewayService + Identity 迁移

**目标**：在 `@telagent/node` 中新增 `ClawNetGatewayService`，封装 `ClawNetClient`；同时将 Identity 的数据来源从直连合约迁移到 ClawNet Node。

**新增依赖**：

```json
// packages/node/package.json
{
  "dependencies": {
    "@claw-network/sdk": "^0.2.2"
  }
}
```

**新增文件**：`packages/node/src/services/clawnet-gateway.ts`

```typescript
import { ClawNetClient } from '@claw-network/sdk';

export interface ClawNetGatewayConfig {
  nodeUrl: string;       // ClawNet Node REST API base URL
  apiKey?: string;       // 可选 API Key
  timeoutMs?: number;    // 请求超时，默认 30s
}

export class ClawNetGatewayService {
  readonly client: ClawNetClient;

  constructor(config: ClawNetGatewayConfig) {
    this.client = new ClawNetClient({
      baseUrl: config.nodeUrl,
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? 30_000,
    });
  }

  // ── 身份 ──────────────────────────────────────────────
  async getAgentProfile(did: string) {
    const [identity, reputation] = await Promise.all([
      this.client.identity.resolve(did),
      this.client.reputation.getProfile(did).catch(() => null),
    ]);
    return { identity, reputation };
  }

  // ── 钱包 ──────────────────────────────────────────────
  async getBalance(params?: { did?: string }) {
    return this.client.wallet.getBalance(params);
  }

  async transfer(params: {
    did: string; passphrase: string; nonce: number;
    to: string; amount: number; memo?: string;
  }) {
    return this.client.wallet.transfer(params);
  }

  // ── 市场 ──────────────────────────────────────────────
  async searchMarket(params?: { q?: string; type?: string }) {
    return this.client.markets.search(params);
  }

  async publishTask(params: Parameters<typeof this.client.markets.tasks.publish>[0]) {
    return this.client.markets.tasks.publish(params);
  }

  async bidOnTask(
    listingId: string,
    params: Parameters<typeof this.client.markets.tasks.bid>[1],
  ) {
    return this.client.markets.tasks.bid(listingId, params);
  }

  // ── Escrow ────────────────────────────────────────────
  async createEscrow(params: Parameters<typeof this.client.wallet.createEscrow>[0]) {
    return this.client.wallet.createEscrow(params);
  }

  async releaseEscrow(escrowId: string, params: Parameters<typeof this.client.wallet.releaseEscrow>[1]) {
    return this.client.wallet.releaseEscrow(escrowId, params);
  }

  // ── 信誉 ──────────────────────────────────────────────
  async getReputation(did: string) {
    return this.client.reputation.getProfile(did);
  }

  async leaveReview(params: Parameters<typeof this.client.reputation.record>[0]) {
    return this.client.reputation.record(params);
  }

  // ── 服务合同 ──────────────────────────────────────────
  async createContract(params: Parameters<typeof this.client.contracts.create>[0]) {
    return this.client.contracts.create(params);
  }

  // ── 健康检查 ──────────────────────────────────────────
  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.client.node.getStatus();
      return status.synced;
    } catch {
      return false;
    }
  }
}
```

**配置扩展**：`AppConfig` 中新增 `clawnet` 字段。

```typescript
// config.ts 扩展
export interface ClawNetConfig {
  nodeUrl?: string;       // 显式指定时使用；未设置则自动发现
  apiKey?: string;
  timeoutMs: number;      // 默认 30000
  autoDiscover: boolean;  // 默认 true，自动发现本地 ClawNet Node
}
```

**注入到 TelagentNode**：在 `app.ts` 中，启动时先执行 `discoverClawNetNode()` 自动发现逻辑，发现可用的 ClawNet Node 后实例化 `ClawNetGatewayService` 并传入 RuntimeContext。

#### 4.1.1 Identity 迁移：从直连合约改为通过 ClawNet Node

**迁移目标**：`IdentityAdapterService` 不再直连 `ClawIdentity` 合约，改为委托 `ClawNetGatewayService` 从 ClawNet Node 获取 Identity 数据。

**变更清单**：

| 文件 | 变更 |
|---|---|
| `services/identity-adapter-service.ts` | `resolve()` 改为调 `clawnetGateway.client.identity.resolve(did)`；`getSelf()` 改为调 `clawnetGateway.client.identity.get()` |
| `services/chain-config.ts` | **删除 `selfDid` 字段**；一律从 ClawNet Node 获取，不再允许手动配置 |
| `services/abis.ts` | 移除 `CLAW_IDENTITY_ABI`（不再需要直连 Identity 合约） |
| `services/contract-provider.ts` | 移除 `identity: Contract` 实例 |
| `api/routes/identities.ts` | 返回更丰富的 Identity 信息（含 capabilities） |
| `api/routes/wallets.ts` | 余额查询改为通过 `ClawNetGatewayService` |
| `app.ts` | 启动流程：先连 ClawNet Node → 获取 self identity → 再初始化其他 Service |

**改造后的 `IdentityAdapterService`（伪码）**：

```typescript
export class IdentityAdapterService {
  constructor(
    private readonly contracts: ContractProvider,      // 仅用于群组合约
    private readonly clawnetGateway: ClawNetGatewayService, // 新增
  ) {}

  async getSelf(): Promise<IdentityView> {
    // 从 ClawNet Node 获取，而不是从 config.selfDid 硬编码
    const identity = await this.clawnetGateway.client.identity.get();
    return this.toIdentityView(identity);
  }

  async resolve(rawDid: string): Promise<IdentityView> {
    if (!isDidClaw(rawDid)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'DID must use did:claw format');
    }
    // 通过 ClawNet Node 解析，享受缓存 + 完整信息
    const identity = await this.clawnetGateway.client.identity.resolve(rawDid);
    return this.toIdentityView(identity);
  }

  private toIdentityView(raw: Identity): IdentityView {
    return {
      did: raw.did as AgentDID,
      didHash: hashDid(raw.did as AgentDID),
      controller: raw.controller ?? '',
      publicKey: raw.publicKey,
      isActive: raw.isActive ?? true,
      capabilities: raw.capabilities ?? [],   // 新增：能力列表
      resolvedAtMs: Date.now(),
    };
  }
}
```

**启动流程变更**：

```
TelagentNode.start()
  1. 初始化 ClawNetGatewayService（自动发现 / 自动启动，失败则拒绝启动）
  2. 等待 ClawNet Node 同步完成  ← clawnetGateway.client.node.waitForSync()
  3. 获取 self identity            ← clawnetGateway.client.identity.get()
  4. 用获取到的 DID 初始化其他 Service（GroupService、MessageService 等）
  5. 启动 GroupIndexer、API Server 等
```

> **无 fallback**：ClawNet Node 是 TelAgent 的硬依赖。如果 ClawNet Node 不可用且自动启动失败，TelAgent **拒绝启动并报错退出**，而非降级为 chat-only 模式。`selfDid` 配置项和 `CLAW_IDENTITY_ABI` 直连合约代码已删除，不提供旧路径回退。

### 4.2 Phase B — 扩展消息 ContentType

**目标**：让聊天消息能承载 ClawNet 结构化内容（卡片、交易请求、回执等）。

**当前 ContentType**：`'text' | 'image' | 'file' | 'control'`

**扩展为**：

```typescript
// @telagent/protocol — types.ts
export type ContentType =
  // 已有
  | 'text'
  | 'image'
  | 'file'
  | 'control'
  // ClawNet 集成（新增）
  | 'telagent/identity-card'      // 展示 Identity + Reputation 卡片
  | 'telagent/transfer-request'   // 转账请求
  | 'telagent/transfer-receipt'   // 转账完成回执
  | 'telagent/task-listing'       // 任务发布卡片
  | 'telagent/task-bid'           // 竞标通知
  | 'telagent/escrow-created'     // 托管创建通知
  | 'telagent/escrow-released'    // 托管释放通知
  | 'telagent/milestone-update'   // 里程碑进度更新
  | 'telagent/review-card';       // 评价卡片
```

Envelope 的 `ciphertext` 解密后为 JSON，schema 由 `contentType` 决定。

**Payload 示例**：

```jsonc
// contentType: "telagent/identity-card"
{
  "did": "did:claw:alice",
  "publicKey": "0xabc...",
  "reputation": { "score": 4.8, "reviews": 23 },
  "capabilities": ["data-analysis", "ml-training"]
}

// contentType: "telagent/transfer-request"
{
  "fromDid": "did:claw:alice",
  "toDid": "did:claw:bob",
  "amount": 500,
  "currency": "CLAW",
  "memo": "数据清洗任务预付款",
  "requestId": "req-xxx"
}

// contentType: "telagent/transfer-receipt"
{
  "txHash": "0xdef...",
  "fromDid": "did:claw:alice",
  "toDid": "did:claw:bob",
  "amount": 500,
  "status": "confirmed",
  "timestamp": 1741089600000
}

// contentType: "telagent/task-listing"
{
  "listingId": "task-xxx",
  "title": "数据清洗 — 10万条用户行为日志",
  "pricing": { "model": "fixed", "basePrice": 500 },
  "deadline": 1741694400000,
  "tags": ["data-cleaning", "etl"]
}

// contentType: "telagent/review-card"
{
  "targetDid": "did:claw:alice",
  "rating": 5,
  "comment": "交付质量优秀，提前完成",
  "txHash": "0xghi..."
}
```

### 4.3 Phase C — TelAgent API 新增 ClawNet 代理端点

**目标**：Console / SDK 通过 TelAgent API 统一入口调用 ClawNet 能力，无需直接对接 ClawNet Node。

**新增路由文件**：`packages/node/src/api/routes/clawnet.ts`

| 方法 | 路径 | 描述 |
|---|---|---|
| `GET` | `/api/v1/clawnet/status` | ClawNet Node 连接状态 |
| `GET` | `/api/v1/clawnet/profile/{did}` | Agent Identity + Reputation |
| `GET` | `/api/v1/clawnet/wallet/balance` | 当前 Agent 余额 |
| `POST` | `/api/v1/clawnet/wallet/transfer` | 发起转账 |
| `GET` | `/api/v1/clawnet/wallet/history` | 交易历史 |
| `POST` | `/api/v1/clawnet/escrows` | 创建 Escrow |
| `POST` | `/api/v1/clawnet/escrows/{id}/release` | 释放 Escrow |
| `GET` | `/api/v1/clawnet/markets/search` | 搜索市场 |
| `POST` | `/api/v1/clawnet/markets/tasks` | 发布任务 |
| `POST` | `/api/v1/clawnet/markets/tasks/{id}/bid` | 竞标任务 |
| `GET` | `/api/v1/clawnet/reputation/{did}` | 获取信誉 |
| `POST` | `/api/v1/clawnet/reputation/{did}/review` | 留评 |
| `POST` | `/api/v1/clawnet/contracts` | 创建服务合同 |

**端点行为规则**：
- ClawNet Node 是硬依赖，启动时已确保可用，无需处理不可用场景
- 每个端点内部捕获 `ClawNetError`，转换为 TelAgent 标准 RFC7807 错误
- 保持 TelAgent 的 `{ data }` 成功 envelope 风格

### 4.4 Phase D — Agent Owner WebApp / 客户端集成

> **注意：此阶段为 Agent Owner（人类）的管理界面，非 Agent 自主协作的核心路径。**
> Agent 之间的协作通过 `telagent/*` ContentType 消息的程序化协议交换驱动，不依赖 UI 渲染。

后续推出供 Agent Owner 使用的 WebApp / 桌面客户端时：
1. 渲染 `telagent/*` 类型消息为可视化卡片（供人类监控 Agent 活动）
2. 提供 Agent 配置管理、钱包查看、交易历史等管理功能
3. 允许 Agent Owner 手动触发特定操作（如紧急转账、争议处理）

> 此部分不在本 RFC 的代码范围内，后续单独设计。

## 5. 配置 & 环境变量

### 5.1 自动发现本地 ClawNet Node

如果用户已经在本机部署并运行了 ClawNet Node，TelAgent 应该**自动发现并使用它**，无需手动配置。

#### 发现策略（按优先级从高到低）

```
1. 显式配置（最高优先）
   TELAGENT_CLAWNET_NODE_URL=http://custom-host:9528
   → 直接使用用户指定的地址

2. 本地 ClawNet 数据目录探测
   读取 $CLAWNET_HOME/config.yaml（默认 ~/.clawnet/config.yaml）
   → 解析 api.host / api.port 字段
   → 拼接为 http://{host}:{port}

3. 默认地址探测
   尝试连接 http://127.0.0.1:9528/api/v1/node
   → 如果返回有效的 NodeStatus，则确认可用

4. 自动启动（新增）
   检测 ~/.clawnet 已 init（keys/ 目录存在）
   → 使用 ClawNetNode 编程 API 在进程内启动 ClawNet Node
   → 使用 TelAgent 配置的 passphrase（TELAGENT_CLAWNET_PASSPHRASE）

5. 全新初始化 + 启动
   ~/.clawnet 不存在
   → 自动执行 init（生成密钥 + DID）+ 启动 daemon
   → 助记词自动加密存储到 ~/.telagent/secrets/mnemonic.enc
   → 日志仅打印 DID，不打印助记词（Agent 无人值守，无人备份）

6. Passphrase 验证（对所有场景生效）
   Node 就绪后 → 用 passphrase 尝试一次签名验证
   → 成功 → 继续启动
   → 失败（passphrase 与 keystore 不匹配）→ 报错退出
   → 验证不确定（网络问题等）→ 打印警告，不阻塞启动
```

#### 自动启动方案

当步骤 1-3 都未发现可用的 ClawNet Node，但本机有 ClawNet 安装时，TelAgent 应自动启动一个 ClawNet Node 实例。

**两种启动方式**（按可行性排序）：

**方式 A — 进程内嵌入（推荐）**

`@claw-network/node` 包导出了 `ClawNetNode` 类，支持完全编程式生命周期管理：

```typescript
import { ClawNetNode } from '@claw-network/node';

const clawnetNode = new ClawNetNode({
  dataDir: '~/.clawnet',           // 复用已有数据目录
  passphrase: 'user-passphrase',   // 从 TELAGENT_CLAWNET_PASSPHRASE 读取
  api: { host: '127.0.0.1', port: 9528, enabled: true },
  network: 'devnet',
});

await clawnetNode.start();
// clawnetNode.getDid() → 'did:claw:z6Mk...'
// TelAgent 停止时：
await clawnetNode.stop();
```

优势：
- 同进程，无需子进程管理
- 生命周期与 TelAgent Node 绑定（一起启动、一起停止）
- 可直接访问 `ClawNetNode` 实例（`getDid()`、`getHealth()` 等）
- 无端口冲突风险（可编程指定端口）

**方式 B — 子进程启动（备选）**

当不希望在同进程中运行时，通过 `child_process.spawn` 启动 `clawnetd`：

```typescript
import { spawn } from 'node:child_process';

const child = spawn('clawnetd', [
  '--passphrase', passphrase,
  '--api-port', '9528',
], {
  stdio: 'pipe',
  detached: false,
  env: { ...process.env, CLAWNET_HOME: clawnetHome },
});
```

适用场景：
- ClawNet 已通过 npm/pkg 全局安装了 `clawnetd` 二进制
- 需要进程级隔离

#### 发现 + 自动启动完整流程伪码

```typescript
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';

interface ClawNetDiscoveryResult {
  found: boolean;
  nodeUrl?: string;
  source:
    | 'explicit-config'
    | 'clawnet-config-yaml'
    | 'default-probe'
    | 'auto-started'
    | 'auto-initialized';
  clawnetHome?: string;
  managedNode?: ClawNetNode;  // 非 null 表示由 TelAgent 管理生命周期
}

async function discoverOrStartClawNet(
  explicitUrl?: string,
  passphrase?: string,
): Promise<ClawNetDiscoveryResult> {
  const clawnetHome = process.env.CLAWNET_HOME ?? resolve(homedir(), '.clawnet');

  // ── 1. 显式配置 ─────────────────────────────────────
  if (explicitUrl) {
    return { found: true, nodeUrl: explicitUrl, source: 'explicit-config' };
  }

  // ── 2. 读取本地 ClawNet config.yaml ─────────────────
  const configPath = resolve(clawnetHome, 'config.yaml');
  try {
    const raw = readFileSync(configPath, 'utf8');
    const config = parseYaml(raw);
    const host = config?.api?.host ?? '127.0.0.1';
    const port = config?.api?.port ?? 9528;
    const url = `http://${host}:${port}`;
    if (await probeNodeHealth(url)) {
      return { found: true, nodeUrl: url, source: 'clawnet-config-yaml', clawnetHome };
    }
  } catch {
    // 继续
  }

  // ── 3. 默认地址探测 ─────────────────────────────────
  const defaultUrl = 'http://127.0.0.1:9528';
  if (await probeNodeHealth(defaultUrl)) {
    return { found: true, nodeUrl: defaultUrl, source: 'default-probe' };
  }

  // ── 4. 自动启动 ─────────────────────────────────────
  if (!passphrase) {
    throw new Error(
      '[telagent] FATAL: ClawNet Node not found and no passphrase configured. ' +
      'Set TELAGENT_CLAWNET_PASSPHRASE or start a ClawNet Node manually.'
    );
  }

  const keysDir = resolve(clawnetHome, 'keys');
  const alreadyInitialized = existsSync(keysDir);

  if (!alreadyInitialized) {
    // ── 5. 全新初始化 ─────────────────────────────────
    logger.info('[telagent] No ClawNet installation found — initializing...');
    await initClawNet(clawnetHome, passphrase);
    logger.info('[telagent] ClawNet initialized at %s', clawnetHome);
    // 助记词自动加密存储，不打印到日志（Agent 无人值守）
    await saveMnemonic(telagentPaths, mnemonic, passphrase);
    logger.info('[telagent] Mnemonic encrypted and stored at %s', telagentPaths.mnemonicFile);
  }

  // 启动嵌入式 ClawNet Node
  const { ClawNetNode } = await import('@claw-network/node');
  const managedNode = new ClawNetNode({
    dataDir: clawnetHome,
    passphrase,
    api: { host: '127.0.0.1', port: 9528, enabled: true },
  });
  await managedNode.start();

  const did = managedNode.getDid();
  logger.info('[telagent] Embedded ClawNet Node started — DID: %s', did);

  return {
    found: true,
    nodeUrl: defaultUrl,
    source: alreadyInitialized ? 'auto-started' : 'auto-initialized',
    clawnetHome,
    managedNode,
  };
}

async function probeNodeHealth(url: string): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/api/v1/node`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return false;
    const body = await resp.json();
    return typeof body?.data?.did === 'string';
  } catch {
    return false;
  }
}

/**
 * 启动时 Passphrase 验证
 *
 * 当 TelAgent 发现已存在的外部 ClawNet Node 时，配置的 passphrase
 * 可能和该 Node init 时生成的 keystore 不一致。为避免运行时所有
 * 写操作静默失败，启动时主动验证一次。
 *
 * 验证方式：用 passphrase 尝试签名一个无副作用的操作。
 * 具体调用 wallet.getNonce({ did })（只读）获取 DID，
 * 再用 identity.resolve(did) 携带 passphrase 验证签名能力。
 * 如签名失败，说明 passphrase 与 keystore 不匹配。
 */
async function verifyPassphrase(
  nodeUrl: string,
  passphrase: string,
): Promise<{ valid: boolean; did?: string; error?: string }> {
  try {
    const { ClawNetClient } = await import('@claw-network/sdk');
    const client = new ClawNetClient({ baseUrl: nodeUrl });

    // 1. 获取 Node 的 DID（只读，不需要 passphrase）
    const nodeResp = await fetch(`${nodeUrl}/api/v1/node`);
    const nodeBody = await nodeResp.json();
    const did = nodeBody?.data?.did as string;
    if (!did) return { valid: false, error: 'Cannot retrieve DID from ClawNet Node' };

    // 2. 用 passphrase 尝试获取 nonce（这个操作内部会解密 keystore 验证密码）
    //    如果 passphrase 错误，ClawNet Node 返回解密失败错误
    await client.wallet.getNonce({ did, passphrase });

    return { valid: true, did };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes('decrypt') || msg.includes('passphrase') || msg.includes('password')) {
      return { valid: false, error: `Passphrase mismatch: ${msg}` };
    }
    // 其他错误（网络问题等）不阻塞启动，但打印警告
    return { valid: true, error: `Passphrase verification inconclusive: ${msg}` };
  }
}
```

#### 生命周期管理

当 ClawNet Node 由 TelAgent 自动启动时，TelAgent 负责其完整生命周期：

```typescript
class TelagentNode {
  private managedClawNet?: ClawNetNode;  // 仅当自动启动时非 null

  async start() {
    const passphrase = process.env.TELAGENT_CLAWNET_PASSPHRASE;
    const discovery = await discoverOrStartClawNet(
      process.env.TELAGENT_CLAWNET_NODE_URL,
      passphrase,
    );
    this.managedClawNet = discovery.managedNode;

    // ── Passphrase 验证 ──────────────────────────────
    // 对所有场景都做一次验证（包括嵌入式启动，防止 passphrase.enc 解密结果有误）
    if (passphrase && discovery.nodeUrl) {
      const check = await verifyPassphrase(discovery.nodeUrl, passphrase);
      if (!check.valid) {
        // 如果是自管 Node，先停掉再退出
        if (this.managedClawNet) await this.managedClawNet.stop();
        throw new Error(
          `[telagent] FATAL: Passphrase verification failed — ${check.error}. ` +
          'Ensure TELAGENT_CLAWNET_PASSPHRASE matches the ClawNet Node keystore.'
        );
      }
      if (check.error) {
        // inconclusive（网络问题等），打印警告但不阻塞
        logger.warn('[telagent] %s', check.error);
      }
      logger.info('[telagent] Passphrase verified — DID: %s', check.did);
    }
    // ... 其余 TelAgent 启动逻辑 ...
  }

  async stop() {
    // TelAgent 自身停止逻辑 ...
    // 最后停止自管的 ClawNet Node
    if (this.managedClawNet) {
      await this.managedClawNet.stop();
      this.managedClawNet = undefined;
    }
  }
}
```

#### 启动日志示例

场景 1 — 发现已有 ClawNet Node：
```
[telagent] ClawNet discovery: found local node via ~/.clawnet/config.yaml
[telagent] ClawNet Node URL: http://127.0.0.1:9528
[telagent] Passphrase verified — DID: did:claw:z6MkhaXgBZD...
[telagent] ClawNet integration: enabled (external)
```

场景 2 — 已 init 但未运行，自动启动：
```
[telagent] ClawNet discovery: node not running, but ~/.clawnet exists
[telagent] Starting embedded ClawNet Node...
[telagent] ClawNet Node started — DID: did:claw:z6MkhaXgBZD...
[telagent] ClawNet integration: enabled (managed)
```

场景 3 — 全新环境，自动初始化 + 启动：
```
[telagent] ClawNet discovery: no installation found
[telagent] Initializing ClawNet at ~/.clawnet ...
[telagent] ClawNet initialized at ~/.clawnet
[telagent] Mnemonic encrypted and stored at ~/.telagent/secrets/mnemonic.enc
[telagent] ClawNet Node started — DID: did:claw:z6MknewAgent...
[telagent] ClawNet integration: enabled (managed, first-run)
```

场景 4 — 无 passphrase，拒绝启动：
```
[telagent] ClawNet discovery: no local node found
[telagent] FATAL: ClawNet Node not found and no passphrase configured.
[telagent] Set TELAGENT_CLAWNET_PASSPHRASE or start a ClawNet Node manually.
[telagent] Process exiting with code 1.
```

场景 5 — Passphrase 不匹配，拒绝启动：
```
[telagent] ClawNet discovery: found local node via default probe
[telagent] FATAL: Passphrase verification failed — Passphrase mismatch: could not decrypt keystore
[telagent] Ensure TELAGENT_CLAWNET_PASSPHRASE matches the ClawNet Node keystore.
[telagent] Process exiting with code 1.
```

### 5.2 环境变量

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `TELAGENT_HOME` | `~/.telagent` | TelAgent 数据根目录（配置、密钥、数据、日志） |
| `TELAGENT_CLAWNET_NODE_URL` | （自动发现） | 显式指定 ClawNet Node REST API 地址，跳过自动发现 |
| `TELAGENT_CLAWNET_PASSPHRASE` | （空/从 secrets 读取） | ClawNet 密钥解锁口令。自动启动/初始化时必填。可通过 §5.4 安全存储 |
| `TELAGENT_CLAWNET_AUTO_START` | `true` | 发现失败时是否自动启动嵌入式 ClawNet Node |
| `TELAGENT_CLAWNET_API_KEY` | （空） | 可选 API Key（远程 ClawNet Node 时使用） |
| `TELAGENT_CLAWNET_TIMEOUT_MS` | `30000` | 请求超时毫秒数 |
| `TELAGENT_CLAWNET_AUTO_DISCOVER` | `true` | 是否启用自动发现。设为 `false` 则仅使用显式配置 |

> 注意：不再需要 `TELAGENT_CLAWNET_ENABLED` 开关。是否启用完全由"是否能找到可用的 ClawNet Node 或能否自动启动"决定。

### 5.3 配置优先级总结

```
显式 URL（TELAGENT_CLAWNET_NODE_URL）
  ↓ 未设置
读取 $CLAWNET_HOME/config.yaml 中的 api 配置
  ↓ 不存在或不可用
探测 http://127.0.0.1:9528
  ↓ 不可用
自动启动嵌入式 ClawNet Node（需要 TELAGENT_CLAWNET_PASSPHRASE）
  ↓ 无 passphrase 或 AUTO_START=false
TelAgent 拒绝启动，报错退出（不降级）
```

ClawNet 的数据目录约定：
- 默认路径：`~/.clawnet`（可通过 `$CLAWNET_HOME` 覆盖）
- 配置文件：`~/.clawnet/config.yaml`
- API 默认端口：`9528`
- P2P 默认端口：`9527`

### 5.4 TelAgent 数据目录：`~/.telagent`

#### 背景

当前 TelAgent 的 `dataDir` 默认值为 **相对路径** `.telagent`（相对于工作目录），这在不同启动方式下会产生不一致的行为。同时，引入 ClawNet 深度集成后，需要安全存储助记词、passphrase 等敏感材料。

因此，TelAgent 应采用与 ClawNet 一致的约定：**使用 `$HOME/.telagent`（或 `$TELAGENT_HOME`）作为固定的数据根目录**。

#### 目录结构

```
~/.telagent/                              # 数据根目录（0o700，仅 owner rwx）
├── config.yaml                           # TelAgent 主配置文件（0o600）
├── secrets/                              # 敏感材料目录（0o700）
│   ├── mnemonic.enc                      # 加密后的助记词（0o600）
│   ├── passphrase.enc                    # 加密后的 ClawNet passphrase（0o600）
│   └── signer-key.enc                    # 加密后的 EVM Signer 私钥（0o600）
├── keys/                                 # TelAgent 自身的密钥记录（0o700）
│   └── {keyId}.json                      # 与 ClawNet KeyRecord 格式兼容
├── data/                                 # 运行时数据
│   ├── mailbox.sqlite                    # 邮箱存储
│   ├── groups.sqlite                     # 群组索引缓存
│   └── state.db                          # 本地状态
├── logs/                                 # 日志目录
│   └── telagent.log
└── cache/                                # 缓存（可安全删除）
    └── identity-cache.json               # Identity 解析缓存
```

> **关键约定**：`secrets/` 目录及其下所有文件权限为 `0o600`（仅 owner 可读写），目录本身为 `0o700`（仅 owner 可进入）。

#### 路径解析

```typescript
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface TelagentStoragePaths {
  root: string;           // ~/.telagent
  config: string;         // ~/.telagent/config.yaml
  secrets: string;        // ~/.telagent/secrets/
  keys: string;           // ~/.telagent/keys/
  data: string;           // ~/.telagent/data/
  logs: string;           // ~/.telagent/logs/
  cache: string;          // ~/.telagent/cache/
  // 具体文件
  mnemonicFile: string;   // ~/.telagent/secrets/mnemonic.enc
  passphraseFile: string; // ~/.telagent/secrets/passphrase.enc
  signerKeyFile: string;  // ~/.telagent/secrets/signer-key.enc
  mailboxDb: string;      // ~/.telagent/data/mailbox.sqlite
}

export function defaultTelagentHome(): string {
  return process.env.TELAGENT_HOME ?? resolve(homedir(), '.telagent');
}

export function resolveTelagentPaths(root?: string): TelagentStoragePaths {
  const r = root ?? defaultTelagentHome();
  const secrets = resolve(r, 'secrets');
  return {
    root: r,
    config: resolve(r, 'config.yaml'),
    secrets,
    keys: resolve(r, 'keys'),
    data: resolve(r, 'data'),
    logs: resolve(r, 'logs'),
    cache: resolve(r, 'cache'),
    mnemonicFile: resolve(secrets, 'mnemonic.enc'),
    passphraseFile: resolve(secrets, 'passphrase.enc'),
    signerKeyFile: resolve(secrets, 'signer-key.enc'),
    mailboxDb: resolve(r, 'data', 'mailbox.sqlite'),
  };
}
```

#### 目录初始化与权限管理

```typescript
import { mkdir, chmod, stat, writeFile } from 'node:fs/promises';

const DIR_MODE_OWNER_ONLY = 0o700;   // rwx------
const FILE_MODE_OWNER_ONLY = 0o600;  // rw-------

export async function ensureTelagentDirs(paths: TelagentStoragePaths): Promise<void> {
  // 创建所有目录
  for (const dir of [paths.root, paths.secrets, paths.keys, paths.data, paths.logs, paths.cache]) {
    await mkdir(dir, { recursive: true });
  }
  // 对 root 和 secrets 强制设置严格权限
  await chmod(paths.root, DIR_MODE_OWNER_ONLY);
  await chmod(paths.secrets, DIR_MODE_OWNER_ONLY);
  await chmod(paths.keys, DIR_MODE_OWNER_ONLY);
}

/**
 * 安全写入文件：先写临时文件 → chmod → rename（原子操作）
 * 解决"写入后再改权限"之间的竞态窗口问题
 */
export async function writeSecretFile(filePath: string, content: string | Buffer): Promise<void> {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    // 1. 创建临时文件，内容为空
    //    使用 flag 'wx' 排它创建，防止其他进程干扰
    await writeFile(tmpPath, '', { mode: FILE_MODE_OWNER_ONLY, flag: 'wx' });

    // 2. 确认权限已生效（防御性检查）
    const s = await stat(tmpPath);
    const actualMode = s.mode & 0o777;
    if (actualMode !== FILE_MODE_OWNER_ONLY) {
      // umask 可能导致 mode 偏移，强制修正
      await chmod(tmpPath, FILE_MODE_OWNER_ONLY);
    }

    // 3. 写入实际内容
    await writeFile(tmpPath, content, { mode: FILE_MODE_OWNER_ONLY });

    // 4. 原子 rename
    const { rename } = await import('node:fs/promises');
    await rename(tmpPath, filePath);
  } catch (error) {
    // 清理临时文件
    try { await (await import('node:fs/promises')).unlink(tmpPath); } catch { /* ignore */ }
    throw error;
  }
}

/**
 * 启动时校验 secrets/ 目录权限
 * 如果权限过宽（如 0o644），拒绝启动并提示用户修复
 */
export async function verifySecretsPermissions(paths: TelagentStoragePaths): Promise<void> {
  for (const dir of [paths.root, paths.secrets]) {
    try {
      const s = await stat(dir);
      const mode = s.mode & 0o777;
      if (mode & 0o077) {  // group/other 有任何权限
        // 尝试自动修复
        try {
          await chmod(dir, DIR_MODE_OWNER_ONLY);
          logger.warn('[telagent] Fixed insecure permissions on %s: %o → %o', dir, mode, DIR_MODE_OWNER_ONLY);
        } catch {
          throw new Error(
            `[SECURITY] ${dir} has insecure permissions (${mode.toString(8)}). ` +
            `Expected 0700. Please run: chmod 700 ${dir}`
          );
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') continue;
      throw error;
    }
  }
}
```

#### 助记词安全存储

当 TelAgent 首次自动初始化 ClawNet（§5.1 步骤 5）时，生成的助记词需要安全持久化：

```typescript
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

interface EncryptedSecret {
  v: 1;
  kdf: 'scrypt';
  salt: string;         // hex
  nonce: string;        // hex
  ciphertext: string;   // hex
  tag: string;          // hex
  createdAt: string;
}

/**
 * 使用 passphrase 加密助记词后存储
 * 加密方案：scrypt KDF + AES-256-GCM
 */
export async function saveMnemonic(
  paths: TelagentStoragePaths,
  mnemonic: string,
  passphrase: string,
): Promise<void> {
  const salt = randomBytes(32);
  const key = scryptSync(passphrase, salt, 32, { N: 2 ** 17, r: 8, p: 1 });
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(mnemonic, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const record: EncryptedSecret = {
    v: 1,
    kdf: 'scrypt',
    salt: salt.toString('hex'),
    nonce: nonce.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    tag: tag.toString('hex'),
    createdAt: new Date().toISOString(),
  };

  await writeSecretFile(paths.mnemonicFile, JSON.stringify(record, null, 2));
}

/**
 * 从文件读取并解密助记词
 */
export async function loadMnemonic(
  paths: TelagentStoragePaths,
  passphrase: string,
): Promise<string> {
  const raw = await readFile(paths.mnemonicFile, 'utf8');
  const record = JSON.parse(raw) as EncryptedSecret;

  const salt = Buffer.from(record.salt, 'hex');
  const key = scryptSync(passphrase, salt, 32, { N: 2 ** 17, r: 8, p: 1 });
  const nonce = Buffer.from(record.nonce, 'hex');
  const ciphertext = Buffer.from(record.ciphertext, 'hex');
  const tag = Buffer.from(record.tag, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
```

**安全要点**：
- 助记词**永远不以明文形式**写入磁盘
- 使用 `passphrase` → `scrypt` KDF → `AES-256-GCM` 加密
- 加密文件权限 `0o600`，仅 owner 可读写
- 需要 passphrase 才能解密（passphrase 本身也加密存储或从环境变量读取）

#### Passphrase 安全存储

Passphrase 的存储是一个"鸡生蛋蛋生鸡"问题 — 用什么加密 passphrase 本身？方案如下：

```
优先级（从高到低）：

1. 环境变量（生产 / 容器环境）
   TELAGENT_CLAWNET_PASSPHRASE=xxx
   → 通过 secrets manager 注入，适合 CI/CD 和容器化部署

2. 设备绑定密钥加密（v1 实现）
   使用 machine-id + user-id 派生一个设备绑定的加密密钥
   → 不依赖外部服务，但拷贝到其他机器时需要重新配置

3. 系统 Keyring（随 Agent Owner WebApp / 客户端实现）
   macOS: Keychain Access
   Linux: libsecret / GNOME Keyring
   → 由 OS 管理加密，供人类 Agent Owner 使用
```

**v1 实现 — 设备绑定密钥方案**：

```typescript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';

/**
 * 派生设备绑定密钥：
 * HKDF(SHA-256, machine-id || hostname || uid, "telagent-passphrase-encryption")
 *
 * 注意：这不是高安全性方案（有 root 权限的攻击者可以重建密钥）
 * 但足以防止 secrets 文件被拷贝到其他机器后直接使用
 */
function deriveDeviceBoundKey(): Buffer {
  let machineId = 'unknown';
  try {
    // Linux: /etc/machine-id, macOS: IOPlatformUUID
    machineId = readFileSync('/etc/machine-id', 'utf8').trim();
  } catch {
    try {
      const { execSync } = require('node:child_process');
      machineId = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/{print $3}' | tr -d '\"'",
        { encoding: 'utf8' }
      ).trim();
    } catch { /* use hostname fallback */ }
  }

  const input = `${machineId}:${hostname()}:${userInfo().uid}`;
  return createHash('sha256')
    .update('telagent-passphrase-encryption')
    .update(input)
    .digest();
}

export async function savePassphrase(
  paths: TelagentStoragePaths,
  passphrase: string,
): Promise<void> {
  const key = deriveDeviceBoundKey();
  // 使用与助记词相同的 AES-256-GCM 流程加密
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(passphrase, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const record = {
    v: 1,
    binding: 'device',
    nonce: nonce.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    tag: tag.toString('hex'),
    createdAt: new Date().toISOString(),
  };

  await writeSecretFile(paths.passphraseFile, JSON.stringify(record, null, 2));
}

export async function loadPassphrase(paths: TelagentStoragePaths): Promise<string | null> {
  try {
    const raw = await readFile(paths.passphraseFile, 'utf8');
    const record = JSON.parse(raw);
    const key = deriveDeviceBoundKey();
    const nonce = Buffer.from(record.nonce, 'hex');
    const ciphertext = Buffer.from(record.ciphertext, 'hex');
    const tag = Buffer.from(record.tag, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;  // 文件不存在或解密失败
  }
}
```

#### Passphrase 解析优先级

启动时，TelAgent 按以下优先级获取 ClawNet passphrase：

```
1. 环境变量 TELAGENT_CLAWNET_PASSPHRASE        → 最高优先
2. 本地加密文件 ~/.telagent/secrets/passphrase.enc → 设备绑定密钥解密
3. 系统 Keyring（随 Agent Owner 客户端实现）  → OS 级安全存储
4. 以上均无                                       → TelAgent 拒绝启动，报错退出
```

#### TelAgent 配置文件

`~/.telagent/config.yaml` 持久化 TelAgent 的运行时配置。环境变量 **优先级高于** 配置文件（12-Factor App 原则），但配置文件提供默认值：

```yaml
# ~/.telagent/config.yaml
v: 1

api:
  host: 127.0.0.1
  port: 9529

chain:
  rpcUrl: http://127.0.0.1:8545
  chainId: 7625
  contracts:
    telagentGroupRegistry: "0x..."

clawnet:
  autoDiscover: true
  autoStart: true
  timeoutMs: 30000
  # nodeUrl: http://custom:9528    # 显式指定时取消注释

federation:
  selfDomain: agent-alice.example.com
  protocolVersion: v1

mailbox:
  backend: sqlite
  # sqlitePath 默认为 ~/.telagent/data/mailbox.sqlite

logging:
  level: info
  # file: ~/.telagent/logs/telagent.log  # 不设置则输出到 stdout
```

#### 权限异常处理

| 场景 | 行为 |
|---|---|
| `~/.telagent` 不存在 | 自动创建，权限 `0o700` |
| `~/.telagent/secrets/` 权限过宽（如 `0o755`） | 尝试自动修复为 `0o700`；修复失败则拒绝启动并提示 |
| 加密文件写入后，自身无法重新读取 | `writeSecretFile` 使用 `stat()` 防御性校验；如果 uid 不匹配则打印明确错误 |
| 以 root 创建后切换用户运行 | 检测 `stat.uid !== process.getuid()` 时发出警告 |
| Docker 容器中（无真实 uid） | 跳过权限校验（`process.platform === 'linux' && uid === 0`），改用环境变量传递 secrets |

#### 破坏性变更：删除 `TELAGENT_DATA_DIR`，统一使用 `TELAGENT_HOME`

当前 `loadConfigFromEnv()` 中的旧代码：

```typescript
const dataDir = process.env.TELAGENT_DATA_DIR || '.telagent';  // ❌ 直接删除
```

**直接删除，无过渡期**：

```
1. 删除 TELAGENT_DATA_DIR 环境变量支持，代码中不再读取
2. 新增 TELAGENT_HOME 环境变量，默认值 ~/.telagent
3. 如果检测到 TELAGENT_DATA_DIR 环境变量仍被设置:
   → 拒绝启动，打印明确错误: "TELAGENT_DATA_DIR is removed. Use TELAGENT_HOME instead."
4. 所有路径（mailbox.sqlite、logs 等）基于 TELAGENT_HOME 解析
5. 旧的相对路径 .telagent/ 数据不自动迁移，用户需手动移动
```

#### 与 ClawNet 数据目录的关系

```
~/.telagent/    ← TelAgent 自身数据（配置、密钥、邮箱、日志）
~/.clawnet/     ← ClawNet Node 数据（由 ClawNet 管理，TelAgent 仅读取发现）
```

两个目录**完全独立**，各自管理各自的数据。TelAgent 只在 §5.1 自动发现阶段读取 `~/.clawnet/config.yaml`，不会写入 ClawNet 的数据目录。

### 5.5 Session-Based 短期签名授权

#### 问题

ClawNet SDK 的所有写操作（转账、Escrow、市场发布、竞标、评价等）都继承 `EventFields`，要求每次调用传入 `did + passphrase + nonce`：

```typescript
// ClawNet SDK — 所有写操作的基类
interface EventFields {
  did: string;
  passphrase: string;   // ← 每次都要传
  nonce: number;
  prev?: string;
  ts?: number;
}

// 例：转账
interface TransferParams extends EventFields {
  to: string;
  amount: number;
}
```

ClawNet Node 收到请求后，用 `resolvePrivateKey(dataDir, did, passphrase)` 解密 keystore 中的私钥来签名 event。这意味着：

1. **Console→TelAgent Node 的每个写请求都需要携带 passphrase** → 频繁传输，增加泄露面
2. **passphrase 明文出现在 HTTP request body 中** → 即使是 localhost，进程崩溃时的 core dump / 日志可能泄露
3. **无法限制操作频率和范围** → 拿到 passphrase 就能做任何操作，无细粒度控制

#### 方案：Unlock Session

引入 session 机制：Console 只需传一次 passphrase 来 "解锁"，之后所有写操作通过 session token 授权，TelAgent Node 内部注入 passphrase。

```
                    ┌──────────────────────────────────────┐
                    │         TelAgent Node                 │
   Console          │                                      │     ClawNet Node
                    │  ┌─────────────────────────────┐     │
 ── POST /unlock ──→│  │  SessionManager              │     │
    {passphrase}    │  │   sessions: Map<token, Sess>  │     │
                    │  │   ├ validate passphrase       │     │
 ←── {sessionToken, │  │   ├ cache passphrase in mem   │     │
      expiresAt}    │  │   └ issue sessionToken        │     │
                    │  └──────────┬──────────────────┘     │
                    │             │                         │
 ── POST /transfer ─→│            │ inject passphrase      │
    {sessionToken,  │  │          ▼                         │
     to, amount}    │  │  ClawNetGateway.transfer({         │──→ POST /api/v1/transfers
                    │  │    did, passphrase, nonce,         │    {did, passphrase, nonce,
 ←── {txHash}       │  │    to, amount                      │     to, amount}
                    │  │  })                                │
                    │  └───────────────────────────────────┘│
                    └──────────────────────────────────────┘
```

#### API 设计

**解锁 Session**：

```
POST /api/v1/session/unlock
Content-Type: application/json

{
  "passphrase": "user-passphrase",
  "ttlSeconds": 1800,              // 可选，默认 1800（30 分钟）
  "scope": ["transfer", "escrow", "market"]  // 可选，限制操作范围
}

→ 200 OK
{
  "data": {
    "sessionToken": "tses_a1b2c3d4e5f6...",
    "expiresAt": "2026-03-04T15:30:00Z",
    "scope": ["transfer", "escrow", "market"],
    "did": "did:claw:z6Mk..."
  }
}
```

**锁定 / 销毁 Session**：

```
POST /api/v1/session/lock
Authorization: Bearer tses_a1b2c3d4e5f6...

→ 204 No Content
```

**查询 Session 状态**：

```
GET /api/v1/session
Authorization: Bearer tses_a1b2c3d4e5f6...

→ 200 OK
{
  "data": {
    "active": true,
    "expiresAt": "2026-03-04T15:30:00Z",
    "scope": ["transfer", "escrow", "market"],
    "operationsUsed": 12,
    "createdAt": "2026-03-04T15:00:00Z"
  }
}
```

**写操作使用 Session Token（取代 passphrase）**：

```
POST /api/v1/clawnet/wallet/transfer
Authorization: Bearer tses_a1b2c3d4e5f6...
Content-Type: application/json

{
  "to": "did:claw:bob",
  "amount": 500,
  "memo": "数据清洗任务预付款"
}

// 注意：不再传 passphrase、did、nonce
// TelAgent Node 从 session 中注入 passphrase + did
// nonce 由 TelAgent Node 自动管理（§10 开放问题 2）
```

#### SessionManager 实现

```typescript
import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

interface Session {
  token: string;
  tokenHash: Buffer;          // 存储 hash 而非明文 token
  did: string;
  passphrase: string;         // 仅内存中持有
  scope: OperationScope[];
  expiresAt: number;          // Unix ms
  createdAt: number;
  operationsUsed: number;
  maxOperations?: number;     // 可选：最大操作次数
}

type OperationScope =
  | 'transfer'
  | 'escrow'
  | 'market'
  | 'contract'
  | 'reputation'
  | 'identity';

const ALL_SCOPES: OperationScope[] = [
  'transfer', 'escrow', 'market', 'contract', 'reputation', 'identity',
];

export class SessionManager {
  private sessions = new Map<string, Session>();  // key = tokenHash hex
  private cleanupTimer: ReturnType<typeof setInterval>;

  // 安全常量
  private static readonly TOKEN_BYTES = 32;
  private static readonly TOKEN_PREFIX = 'tses_';
  private static readonly DEFAULT_TTL_MS = 30 * 60 * 1000;       // 30 分钟
  private static readonly MAX_TTL_MS = 24 * 60 * 60 * 1000;      // 24 小时上限
  private static readonly MAX_CONCURRENT_SESSIONS = 3;            // 单 Node 最大并发 session
  private static readonly CLEANUP_INTERVAL_MS = 60 * 1000;       // 每分钟清理过期

  constructor() {
    // 定期清理过期 session
    this.cleanupTimer = setInterval(() => this.evictExpired(), SessionManager.CLEANUP_INTERVAL_MS);
    // 防止 timer 阻止进程退出
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * 解锁：验证 passphrase 后创建 session
   */
  async unlock(params: {
    passphrase: string;
    did: string;
    ttlSeconds?: number;
    scope?: OperationScope[];
    maxOperations?: number;
    validatePassphrase: (did: string, passphrase: string) => Promise<boolean>;
  }): Promise<{ sessionToken: string; expiresAt: Date; scope: OperationScope[] }> {
    // 1. 并发 session 数限制
    this.evictExpired();
    if (this.sessions.size >= SessionManager.MAX_CONCURRENT_SESSIONS) {
      throw new Error('Too many active sessions. Lock an existing session first.');
    }

    // 2. 验证 passphrase 是否正确
    //    通过尝试调用 ClawNet Node 验证（如 identity.get()）
    const valid = await params.validatePassphrase(params.did, params.passphrase);
    if (!valid) {
      throw new Error('Invalid passphrase');
    }

    // 3. 生成 session token
    const tokenRaw = randomBytes(SessionManager.TOKEN_BYTES);
    const token = SessionManager.TOKEN_PREFIX + tokenRaw.toString('base64url');
    const tokenHash = this.hashToken(token);

    // 4. 计算 TTL
    const ttlMs = Math.min(
      (params.ttlSeconds ?? 1800) * 1000,
      SessionManager.MAX_TTL_MS,
    );
    const scope = params.scope?.length ? params.scope : ALL_SCOPES;

    const session: Session = {
      token: '',           // 不存储明文 token
      tokenHash,
      did: params.did,
      passphrase: params.passphrase,  // 内存中持有
      scope,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
      operationsUsed: 0,
      maxOperations: params.maxOperations,
    };

    this.sessions.set(tokenHash.toString('hex'), session);

    return {
      sessionToken: token,
      expiresAt: new Date(session.expiresAt),
      scope,
    };
  }

  /**
   * 从 session token 解析出 passphrase（用于注入 ClawNet SDK 调用）
   */
  resolvePassphrase(token: string, requiredScope: OperationScope): {
    did: string;
    passphrase: string;
  } {
    const tokenHash = this.hashToken(token);
    const session = this.sessions.get(tokenHash.toString('hex'));

    if (!session) {
      throw new Error('Invalid or expired session token');
    }

    // 检查过期
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(tokenHash.toString('hex'));
      throw new Error('Session expired. Please unlock again.');
    }

    // 检查 scope
    if (!session.scope.includes(requiredScope)) {
      throw new Error(
        `Session does not have '${requiredScope}' scope. Authorized scopes: ${session.scope.join(', ')}`,
      );
    }

    // 检查操作次数
    if (session.maxOperations && session.operationsUsed >= session.maxOperations) {
      this.sessions.delete(tokenHash.toString('hex'));
      throw new Error('Session operation limit reached. Please unlock a new session.');
    }

    session.operationsUsed++;
    return { did: session.did, passphrase: session.passphrase };
  }

  /**
   * 锁定 / 销毁 session
   */
  lock(token: string): void {
    const tokenHash = this.hashToken(token);
    const key = tokenHash.toString('hex');
    const session = this.sessions.get(key);
    if (session) {
      // 安全擦除内存中的 passphrase
      session.passphrase = '\0'.repeat(session.passphrase.length);
      this.sessions.delete(key);
    }
  }

  /**
   * 销毁所有 session（Node 停止时调用）
   */
  lockAll(): void {
    for (const [key, session] of this.sessions) {
      session.passphrase = '\0'.repeat(session.passphrase.length);
    }
    this.sessions.clear();
    clearInterval(this.cleanupTimer);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now > session.expiresAt) {
        session.passphrase = '\0'.repeat(session.passphrase.length);
        this.sessions.delete(key);
      }
    }
  }

  private hashToken(token: string): Buffer {
    return createHmac('sha256', 'telagent-session')
      .update(token)
      .digest();
  }
}
```

#### 安全设计要点

| 关注点 | 措施 |
|---|---|
| **Token 存储** | SessionManager 只存储 token 的 HMAC hash，不存储明文 token。客户端泄露 token 可以被撤销，服务端内存 dump 不会直接暴露 token |
| **Passphrase 生命周期** | 仅保存在 `Session` 对象的内存中；session 过期或 lock 时用 `\0` 覆写后删除（JavaScript GC 不保证即时释放，但显著减少窗口） |
| **TTL 上限** | 强制最大 24 小时，默认 30 分钟。长期运行的 Agent 可定时 renew |
| **Scope 限制** | unlock 时可指定操作范围（如仅允许 `transfer`），防止 session 被滥用于非预期操作 |
| **操作次数限制** | 可选 `maxOperations`，达到上限后 session 自动失效 |
| **并发 session 限制** | 单 Node 最多 3 个活跃 session，防止暴力创建 |
| **Token 格式** | `tses_` 前缀 + 32 bytes base64url，便于日志中识别和 grep（但不应出现在日志中） |
| **GC 后清理** | 定期清理过期 session（每 60 秒），避免内存泄漏 |
| **进程退出清理** | `TelagentNode.stop()` 调用 `sessionManager.lockAll()` 擦除所有 passphrase |

#### ClawNetGatewayService 集成

`ClawNetGatewayService` 的写操作方法签名变更 — 不再直接接受 passphrase，改为接受 session token：

```typescript
export class ClawNetGatewayService {
  constructor(
    config: ClawNetGatewayConfig,
    private readonly sessionManager: SessionManager,
    private readonly nonceManager: NonceManager,  // §5.6
  ) {
    this.client = new ClawNetClient({ ... });
  }

  /**
   * 转账 — 从 session 注入 passphrase + did，自动管理 nonce
   */
  async transfer(
    sessionToken: string,
    params: { to: string; amount: number; memo?: string },
  ): Promise<TransferResult> {
    const { did, passphrase } = this.sessionManager.resolvePassphrase(
      sessionToken, 'transfer',
    );
    const nonce = await this.nextNonce(did);

    return this.client.wallet.transfer({
      did,
      passphrase,
      nonce,
      to: params.to,
      amount: params.amount,
      memo: params.memo,
    });
  }

  /**
   * 创建 Escrow — 同上模式
   */
  async createEscrow(
    sessionToken: string,
    params: { beneficiary: string; amount: number; releaseRules: ReleaseRule[] },
  ): Promise<Escrow> {
    const { did, passphrase } = this.sessionManager.resolvePassphrase(
      sessionToken, 'escrow',
    );
    const nonce = await this.nextNonce(did);

    return this.client.wallet.createEscrow({
      did,
      passphrase,
      nonce,
      ...params,
    });
  }

  // ... 其他写操作同理 ...

  /**
   * Nonce 管理：委托 NonceManager（§5.6）
   */
  private async nextNonce(did: string): Promise<number> {
    return this.nonceManager.next(did);
  }
}
```

#### 两种模式共存

| 模式 | 适用场景 | passphrase 来源 |
|---|---|---|
| **自动 Session 模式**（默认，Agent 主路径） | 自主 Agent 无人值守运行 | 启动时从环境变量 / secrets 读取 → 自动 unlock 长期 session（24h）+ 定时续期 |
| **手动 Session 模式** | Agent Owner WebApp / 客户端（人类管理） | Agent Owner 在 UI 输入 passphrase → POST /unlock → session token |

对于自主 Agent（默认场景）：
```
TelAgent Node 启动时
  → 读取 TELAGENT_CLAWNET_PASSPHRASE 或 ~/.telagent/secrets/passphrase.enc
  → 自动调用 sessionManager.unlock() 创建长期 session（TTL = 24h）
  → 定时续期（每 23 小时 unlock 一次新 session + lock 旧 session）
  → 所有 ClawNet 写操作自动使用内部 session，无需外部触发
```

对于 Agent Owner WebApp / 客户端（后续实现）：
```
Agent Owner 打开 WebApp
  → 点击 "解锁钱包"
    → 输入 passphrase → POST /api/v1/session/unlock
    → 获得 sessionToken，存入内存（sessionStorage，不持久化）
  → 30 分钟内所有 ClawNet 写操作自动附带 sessionToken
  → 过期后 → 提示重新输入 passphrase
```

### 5.6 Nonce 管理

#### 问题

ClawNet 的所有写操作都继承 `EventFields`，要求调用者提供一个**单调递增的 nonce**：

```typescript
interface EventFields {
  did: string;
  passphrase: string;
  nonce: number;        // ← 必须 > 上一次提交的 nonce
  prev?: string;
  ts?: number;
}
```

ClawNet Node 内部通过 `EventStore.getCommittedNonce(issuer)` / `setCommittedNonce(issuer, nonce)` 跟踪每个 DID 的最新已提交 nonce，但：

1. **`getCommittedNonce()` 未暴露为 REST API** — SDK 中没有 `getNonce()` 方法，调用者无法查询当前 nonce
2. **批量操作会消耗多个 nonce** — 例如 `accept-bid` 一次提交 5 个 event（accept-bid → create-order → create-escrow → fund-escrow → update-order），起始 nonce 由客户端提供，后续 `++nonce` 在服务端递增
3. **nonce 重复或跳号会被 EventStore 拒绝** — 导致整个操作失败

因此，TelAgent 必须在本地维护 nonce 计数器。

#### 方案：本地 NonceManager + 同步校准

```
┌──────────────────────────────────────────────────────────────┐
│  TelAgent Node                                                │
│                                                                │
│  NonceManager                                                  │
│  ┌──────────────────────────────────────────────────┐        │
│  │  counters: Map<did, { current, lastSyncedAt }>    │        │
│  │                                                    │        │
│  │  next(did)                                         │        │
│  │    → 返回 ++current                                │        │
│  │    → 写操作成功 → 确认                              │        │
│  │    → 写操作失败(nonce conflict) → 重新同步          │        │
│  │                                                    │        │
│  │  sync(did)                                         │        │
│  │    → 嵌入式：直读 EventStore.getCommittedNonce()    │        │
│  │    → 外部模式：解析最新 event 的 nonce              │        │
│  └──────────────────────────────────────────────────┘        │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

#### NonceManager 实现

```typescript
export class NonceManager {
  /**
   * 内存中的 nonce 计数器
   * key = DID, value = 当前已分配的最大 nonce
   */
  private counters = new Map<string, number>();
  private pending = new Map<string, number>();  // 正在飞行中的操作数
  private lock = new Map<string, Promise<void>>();  // 串行化锁

  constructor(
    private readonly eventStore?: EventStore,  // 嵌入式模式下可用
    private readonly clawnetClient?: ClawNetClient,
  ) {}

  /**
   * 获取下一个可用 nonce（线程安全，串行化同一 DID 的请求）
   */
  async next(did: string): Promise<number> {
    // 串行化：同一 DID 的 nonce 分配不能并发
    await this.acquireLock(did);
    try {
      if (!this.counters.has(did)) {
        await this.sync(did);
      }
      const current = this.counters.get(did) ?? 0;
      const next = current + 1;
      this.counters.set(did, next);
      return next;
    } finally {
      this.releaseLock(did);
    }
  }

  /**
   * 批量预分配 nonce（用于需要多个 event 的操作）
   * 返回起始 nonce，调用者使用 [start, start+1, ..., start+count-1]
   */
  async nextBatch(did: string, count: number): Promise<number> {
    await this.acquireLock(did);
    try {
      if (!this.counters.has(did)) {
        await this.sync(did);
      }
      const current = this.counters.get(did) ?? 0;
      const start = current + 1;
      this.counters.set(did, current + count);  // 一次性前进 count 步
      return start;
    } finally {
      this.releaseLock(did);
    }
  }

  /**
   * 写操作失败后回滚 nonce（避免空洞）
   */
  rollback(did: string, failedNonce: number): void {
    const current = this.counters.get(did);
    if (current !== undefined && current >= failedNonce) {
      this.counters.set(did, failedNonce - 1);
    }
  }

  /**
   * 从 ClawNet 同步当前已提交的 nonce
   */
  async sync(did: string): Promise<void> {
    let committedNonce = 0;

    if (this.eventStore) {
      // 嵌入式模式：直接读取 EventStore（最快、最准确）
      committedNonce = await this.eventStore.getCommittedNonce(did);
    } else if (this.clawnetClient) {
      // 外部模式：通过 SDK 查询 ClawNet Node
      // ClawNet 已提供 wallet.getNonce() API
      const result = await this.clawnetClient.wallet.getNonce({ did });
      committedNonce = result.nonce;
    }

    this.counters.set(did, committedNonce);
  }

  /**
   * 处理 nonce 冲突错误：重新同步后重试
   */
  async handleNonceConflict(did: string): Promise<number> {
    await this.sync(did);
    return this.next(did);
  }

  // ── 串行化锁 ──────────────────────────────────────

  private async acquireLock(did: string): Promise<void> {
    while (this.lock.has(did)) {
      await this.lock.get(did);
    }
    let resolve: () => void;
    this.lock.set(did, new Promise<void>(r => { resolve = r; }));
  }

  private releaseLock(did: string): void {
    this.lock.delete(did);
  }
}
```

#### 初始化策略

| 部署模式 | 初始化方式 | 数据源 |
|---|---|---|
| **嵌入式 ClawNet Node** | `NonceManager(eventStore)` | 直读 `EventStore.getCommittedNonce(did)` — 零延迟、完全准确 |
| **外部 Sidecar** | `NonceManager(undefined, clawnetClient)` | 调用 `clawnetClient.wallet.getNonce({ did })` — 一次 HTTP 请求 |

#### ClawNetGatewayService 中的 nonce 冲突自动重试

写操作遇到 nonce 错误时，自动重新同步 + 重试（最多 3 次）：

```typescript
private async executeWithNonceRetry<T>(
  did: string,
  passphrase: string,
  operation: (nonce: number) => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const nonce = await this.nonceManager.next(did);
    try {
      return await operation(nonce);
    } catch (error) {
      if (this.isNonceConflict(error) && attempt < maxRetries - 1) {
        // nonce 冲突 → 回滚 + 重新同步 + 重试
        this.nonceManager.rollback(did, nonce);
        await this.nonceManager.sync(did);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Nonce conflict: max retries exceeded');
}

private isNonceConflict(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('nonce')
      || error.message.includes('NONCE')
      || error.message.includes('duplicate event');
  }
  return false;
}
```

§5.5 中的 `transfer` / `createEscrow` 等方法改为使用此模式：

```typescript
async transfer(
  sessionToken: string,
  params: { to: string; amount: number; memo?: string },
): Promise<TransferResult> {
  const { did, passphrase } = this.sessionManager.resolvePassphrase(
    sessionToken, 'transfer',
  );
  return this.executeWithNonceRetry(did, passphrase, (nonce) =>
    this.client.wallet.transfer({
      did, passphrase, nonce,
      to: params.to,
      amount: params.amount,
      memo: params.memo,
    }),
  );
}
```

#### 批量操作 nonce 预分配

ClawNet 的部分操作（如 `accept-bid`）服务端内部会连续提交多个 event。例如 accept-bid 一次消耗 5 个 nonce：

```
client 提供 nonce=N
  → accept-bid event      (nonce = N)
  → create-order event    (nonce = N+1)   ← 服务端 ++nonce
  → create-escrow event   (nonce = N+2)
  → fund-escrow event     (nonce = N+3)
  → update-order event    (nonce = N+4)
```

对于这类操作，`NonceManager` 需要一次性前进多步：

```typescript
// 在 ClawNetGatewayService 中
async acceptBid(
  sessionToken: string,
  params: { listingId: string; bidId: string },
): Promise<AcceptBidResult> {
  const { did, passphrase } = this.sessionManager.resolvePassphrase(
    sessionToken, 'market',
  );
  // accept-bid 消耗 5 个 nonce
  const startNonce = await this.nonceManager.nextBatch(did, 5);

  try {
    return await this.client.markets.tasks.acceptBid(params.listingId, {
      did, passphrase,
      nonce: startNonce,
      bidId: params.bidId,
    });
  } catch (error) {
    // 失败时回滚所有预分配的 nonce
    this.nonceManager.rollback(did, startNonce);
    throw error;
  }
}
```

#### 已知批量操作 nonce 消耗表

| 操作 | event 数量 | nonce 消耗 | 源码参考 |
|---|---|---|---|
| `transfer` | 1 | 1 | 单 event |
| `createEscrow` | 1 | 1 | 单 event |
| `releaseEscrow` | 1 | 1 | 单 event |
| `publishTask` | 1 | 1 | 单 event |
| `bid` | 1 | 1 | 单 event |
| **`acceptBid`** | **5** | **5** | accept + order + escrow + fund + update |
| **`completeTask`** | **2-4** | **2-4** | deliver + review + release... |

> 具体 event 数量需要从 ClawNet Node 路由源码中逐个确认。暂以保守值估计，实际部署时调整。

#### ClawNet Nonce API（✅ 已可用）

ClawNet 已提供 `wallet.getNonce()` SDK 方法，支持三种调用方式：

```typescript
// 通过 DID 查询
const result = await claw.wallet.getNonce({ did: 'did:claw:z6Mk...' });

// 通过 EVM 地址查询
const result2 = await claw.wallet.getNonce({ address: '0x130E...' });

// 不传参则默认查询本节点身份
const result3 = await claw.wallet.getNonce();

console.log(result.nonce);   // 42
console.log(result.address); // "0x130E..."
```

返回类型：

```typescript
interface NonceResult {
  did?: string;    // 仅当输入为 DID 时返回
  address: string; // EVM 地址
  nonce: number;   // 当前已提交的 nonce
}
```

嵌入式模式仍可直读 `EventStore`（零网络开销），外部 Sidecar 模式通过此 API 精确获取 nonce。

## 6. 依赖关系

```
@telagent/node
  ├── @telagent/protocol          (workspace, 已有)
  ├── ethers                       (已有，链上直连)
  ├── @claw-network/sdk            (新增，ClawNet REST 客户端)
  ├── @claw-network/node           (新增，嵌入式启动用，导出 ClawNetNode 类)
  ├── @claw-network/core           (新增，存储、配置、密钥管理工具)
  └── ...

运行时依赖：
  └── ClawNet Node                  (外部 Sidecar 或内嵌启动，新增)
```

> **注意**：引入 `@claw-network/node` 和 `@claw-network/core` 是为了支持自动启动场景。如果仅支持外部 Sidecar 模式，只需 `@claw-network/sdk`。

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| ClawNet Node 不可用 | **TelAgent 拒绝启动** | 自动发现 + 自动启动 + health check；全部失败则报错退出，不降级 |
| SDK 版本不兼容 | API 调用失败 | pin 版本 + CI 集成测试 |
| 转账/Escrow 操作需要 passphrase | 频繁传输增加泄露面 | Session-Based 授权（§5.5）：passphrase 只传一次，后续用 session token；内存中持有，TTL 自动过期，支持 scope 限制 |
| ClawNet Node 同步延迟 | 数据不一致 | `waitForSync()` 启动前置检查 |
| 嵌入式 Node 内存/CPU 开销 | TelAgent 资源占用增加 | 监控资源使用；提供配置开关 `AUTO_START=false` 允许禁用 |
| 嵌入式 Node 端口冲突 | 启动失败 | 检测端口占用，自动选择可用端口；全部失败则报错退出 |
| Passphrase 存储安全 | 密钥泄露 | v1 使用设备绑定密钥加密存储于 `~/.telagent/secrets/`（§5.4）；v2 引入系统 Keyring |
| 助记词备份风险（自动 init） | 密钥丢失无法恢复 | 助记词自动加密存储到 `~/.telagent/secrets/mnemonic.enc`，日志不打印助记词（Agent 无人值守）；提供 API/CLI 导出命令供 Agent Owner 按需备份 |
| Passphrase 与外部 Node 不匹配 | 所有 ClawNet 写操作静默失败 | 启动时 `verifyPassphrase()` 主动验证（§5.1 步骤 6）；不匹配则报错退出，避免运行时才发现 |
| 消息 ContentType 扩展导致旧客户端不兼容 | 旧客户端无法渲染 `telagent/*` 卡片 | **不提供 fallback**，强制要求客户端升级。旧客户端连接时 API 返回版本不兼容错误 |

## 8. 实施排期建议

| 阶段 | 内容 | 预估 |
|---|---|---|
| Phase A | 引入 SDK、ClawNetGatewayService、配置扩展 | 1 天 |
| Phase B | 扩展 ContentType、定义 Payload Schema | 0.5 天 |
| Phase C | 新增 `/api/v1/clawnet/*` 代理端点 | 1.5 天 |
| Phase D | Console UI 卡片渲染 + 交互 | 2-3 天 |
| 集成测试 | 端到端场景（聊天中完成一笔交易） | 1 天 |

## 9. 变更与未变更部分对照

### 9.1 需要变更的部分

以下模块将从"直连合约"迁移为"通过 ClawNet Node"：

| 模块 | 当前做法 | 迁移后 |
|---|---|---|
| `IdentityAdapterService.getSelf()` | 读 `config.selfDid` + 直连合约 | 调 `ClawNetClient.identity.get()` |
| `IdentityAdapterService.resolve()` | 直连 `ClawIdentity` 合约 3 个 view | 调 `ClawNetClient.identity.resolve(did)` |
| `IdentityAdapterService.assertActiveDid()` | 基于 `resolve()` 判断 `isActive` | 同上，由 ClawNet Node 返回完整状态 |
| `CLAW_IDENTITY_ABI` | 手写 3 个方法签名 | 移除，不再需要 |
| `ContractProvider.identity` | 持有 `ClawIdentity` 合约实例 | 移除 |
| `chain-config.ts` 的 `selfDid` | 必填配置 | **删除该字段**，一律从 ClawNet Node 获取 |
| `routes/wallets.ts` gas-balance | 直连合约查 `balanceOf(controller)` | 通过 ClawNet SDK 查询正确的 DID 余额 |
| `app.ts` 启动流程 | 仅启动 TelAgent 自身服务 | 新增 ClawNet 发现/自动启动逻辑 + 生命周期管理 |
| `config.ts` | 无 ClawNet 相关配置 | 新增 `TELAGENT_CLAWNET_PASSPHRASE` / `AUTO_START` 等环境变量 |
| `config.ts` `dataDir` | 相对路径 `.telagent` | **删除 `TELAGENT_DATA_DIR`**，替换为 `TELAGENT_HOME`（`~/.telagent`）。设置旧变量则拒绝启动 |
| 无 `secrets/` 目录 | 敏感信息仅在环境变量中 | 新增 `~/.telagent/secrets/` 安全存储助记词、passphrase |  
| 无存储路径模块 | `dataDir` 仅一个字符串 | 新增 `resolveTelagentPaths()` 模块，统一路径解析 |
| `TELAGENT_SELF_DID` 环境变量 | 手动配置 DID | **删除**，运行时检测到该变量则拒绝启动并提示 |

### 9.2 不受影响的部分

以下现有架构不涉及 ClawNet Identity 直连，无需变更：

- **TelagentGroupRegistry 直连合约**：TelAgent 自有合约，ClawNet 不知道它，保留直连
- **GasService 的预检逻辑**：群组操作的 gas 预检直连 RPC（TelAgent 自己发的交易）
- **GroupIndexer**：直连事件监听
- **消息投递核心**：Envelope 序号/去重/离线拉取逻辑
- **`hashDid()` / `isDidClaw()` 工具函数**：继续保留在 `@telagent/protocol` 中

## 10. 开放问题（待审阅讨论）

1. **passphrase 管理** ✅ **已解决（§5.5）**：引入 Session-Based 短期签名授权。Console 只需传一次 passphrase 解锁 session（默认 30 分钟 TTL），后续所有写操作通过 session token 授权，TelAgent Node 内部注入 passphrase。支持 scope 限制、操作次数限制、并发 session 限制。自动化 Agent 可使用长期 session（24h）+ 定时续期。
2. **Nonce 管理** ✅ **已解决（§5.6）**：TelAgent 本地维护 `NonceManager` 计数器。嵌入式模式直读 `EventStore.getCommittedNonce()`；外部 Sidecar 模式通过 `clawnetClient.wallet.getNonce({ did })` 查询（ClawNet 已提供该 API）。批量操作（如 accept-bid 消耗 5 个 nonce）使用 `nextBatch()` 预分配，失败时 rollback。写操作内置 nonce 冲突自动重试（最多 3 次）。
3. **ContentType 命名空间** ✅ **已确定**：使用 `telagent/*`（如 `telagent/identity-card`、`telagent/transfer-request`）。ContentType 定义在 `@telagent/protocol`，是 TelAgent 消息协议层概念，数据来源（ClawNet / XMTP / Lens 等）仅为实现细节。`telagent/*` 命名空间确保未来接入其他协议时 ContentType 无需变更，payload 内部承载不同来源的数据即可。
4. **ClawNet Node 是否共用同一个 DID** ✅ **已确定：共用同一个 `did:claw:*`**。TelAgent Node 没有独立身份，其 DID 就是 ClawNet Node 的 DID（启动时通过 `clawnetGateway.client.identity.get()` 获取）。理由：(1) RFC §4.1.1 已删除 `selfDid` 配置，TelAgent 没有自己的身份系统；(2) 用户旅程要求聊天中的 "Agent A" 和市场/信誉中的 "Agent A" 是同一个 DID，否则信任链断裂；(3) 消息 sender DID 必须与转账/Escrow/评价的 issuer DID 一致，对方才能验证"聊天的人 = 交易的人"；(4) 嵌入式模式下 TelAgent 和 ClawNet Node 同进程，两个 DID 毫无意义；(5) 一个 Agent = 一个 `did:claw:*`，通过 TelAgent 聊天，通过 ClawNet 交易。
5. **DAO 集成** ✅ **已确定：不在 TelAgent 范围内**。DAO 治理（提案/投票/委托/国库）是 ClawNet 生态级别的社区活动，不属于 Agent-to-Agent 的直接协作。Agent 参与 DAO 投票通过 ClawNet CLI / ClawNet Console 直接操作，无需通过 TelAgent 聊天界面。`ClawNetGatewayService` 不封装 `DaoApi`，Session scope 不包含 `dao`。
6. **系统 Keyring 集成时间** ✅ **已确定：随 WebApp / 客户端程序推出时引入**。v1 使用设备绑定密钥加密 passphrase（§5.4），满足 Node 后端场景。当后续推出供 Agent 拥有者（人类）使用的 WebApp 和桌面/移动客户端程序时，引入系统 Keyring（macOS Keychain / libsecret / Windows Credential Manager，通过 `keytar` 或同类库），为终端用户提供 OS 级别的安全凭证管理。当前 v1 不需要 Keyring — Node 进程无图形界面，设备绑定密钥 + 环境变量已足够。

---

> 请审阅以上方案，重点关注第 3 节架构决策、破坏性重构声明和第 10 节开放问题。
