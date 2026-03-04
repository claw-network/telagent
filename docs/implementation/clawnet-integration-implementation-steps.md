# TelAgent × ClawNet 深度集成 — 落地实施步骤

> **本文档是 `clawnet-deep-integration-rfc.md` 的逐步实施指南。**
> 目标读者：OpenAI Codex / AI 编码代理。
> 每个 Step 均为原子可执行单元，包含：输入文件、输出文件、精确代码变更、验证命令。
> **所有变更均为破坏性重构，不保留向后兼容。**

- 文档版本：v1.0
- 日期：2026-03-04
- 源 RFC：`docs/design/clawnet-deep-integration-rfc.md`

---

## 目录

- [全局约定](#全局约定)
- [文件清单总览](#文件清单总览)
- [Phase 0 — 破坏性清理 & 数据目录迁移](#phase-0--破坏性清理--数据目录迁移)
  - [Step 0.1 — 删除旧环境变量与配置字段](#step-01--删除旧环境变量与配置字段)
  - [Step 0.2 — 删除 CLAW_IDENTITY_ABI & ContractProvider.identity](#step-02--删除-claw_identity_abi--contractprovideridentity)
  - [Step 0.3 — 创建 ~/.telagent 数据目录模块](#step-03--创建-telagent-数据目录模块)
  - [Step 0.4 — 迁移 config.ts 到 TELAGENT_HOME](#step-04--迁移-configts-到-telagent_home)
- [Phase 1 — ClawNet 发现 & 自动启动](#phase-1--clawnet-发现--自动启动)
  - [Step 1.1 — 创建 ClawNet Discovery 模块](#step-11--创建-clawnet-discovery-模块)
  - [Step 1.2 — 创建嵌入式 ClawNet Node 管理器](#step-12--创建嵌入式-clawnet-node-管理器)
  - [Step 1.3 — 创建 Passphrase 验证模块](#step-13--创建-passphrase-验证模块)
- [Phase 2 — 安全存储](#phase-2--安全存储)
  - [Step 2.1 — 创建加密存储基础设施](#step-21--创建加密存储基础设施)
  - [Step 2.2 — 创建助记词加密存储](#step-22--创建助记词加密存储)
  - [Step 2.3 — 创建 Passphrase 安全存储](#step-23--创建-passphrase-安全存储)
  - [Step 2.4 — 创建 Passphrase 解析优先级模块](#step-24--创建-passphrase-解析优先级模块)
- [Phase 3 — Session-Based 授权 & Nonce 管理](#phase-3--session-based-授权--nonce-管理)
  - [Step 3.1 — 创建 SessionManager](#step-31--创建-sessionmanager)
  - [Step 3.2 — 创建 NonceManager](#step-32--创建-noncemanager)
  - [Step 3.3 — 创建 Session API 路由](#step-33--创建-session-api-路由)
- [Phase 4 — ClawNetGatewayService & Identity 迁移](#phase-4--clawnetgatewayservice--identity-迁移)
  - [Step 4.1 — 创建 ClawNetGatewayService](#step-41--创建-clawnetgatewayservice)
  - [Step 4.2 — 重构 IdentityAdapterService](#step-42--重构-identityadapterservice)
  - [Step 4.3 — 重构 wallets 路由](#step-43--重构-wallets-路由)
- [Phase 5 — ContentType 扩展 & ClawNet API 路由](#phase-5--contenttype-扩展--clawnet-api-路由)
  - [Step 5.1 — 扩展 ContentType](#step-51--扩展-contenttype)
  - [Step 5.2 — 创建 ClawNet 代理 API 路由](#step-52--创建-clawnet-代理-api-路由)
- [Phase 6 — app.ts 重构 & 启动流程](#phase-6--appts-重构--启动流程)
  - [Step 6.1 — 重构 TelagentNode 类](#step-61--重构-telagentnode-类)
  - [Step 6.2 — 更新 RuntimeContext](#step-62--更新-runtimecontext)
- [Phase 7 — 依赖安装 & 编译验证](#phase-7--依赖安装--编译验证)
  - [Step 7.1 — 安装新依赖](#step-71--安装新依赖)
  - [Step 7.2 — 编译验证](#step-72--编译验证)
- [附录 A — 新增/修改/删除文件完整清单](#附录-a--新增修改删除文件完整清单)
- [附录 B — 环境变量完整清单](#附录-b--环境变量完整清单)
- [附录 C — 已知批量操作 nonce 消耗表](#附录-c--已知批量操作-nonce-消耗表)

---

## 全局约定

### 技术栈
- **Runtime**: Node.js ≥ 22
- **Package Manager**: pnpm 10.18.1
- **Language**: TypeScript（ESM，`.js` 扩展名导入）
- **Monorepo**: pnpm workspace
- **Test**: Node.js built-in test runner (`node --test`)
- **Build**: `tsc`

### 关键路径
- **Monorepo 根**: `/Users/xiasenhai/workspace/private-repo/Bots/telagent/`
- **Node 包**: `packages/node/`
- **Protocol 包**: `packages/protocol/`
- **工作区 tsconfig**: `tsconfig.base.json`

### 命名规范
- 文件名：`kebab-case.ts`
- 类名：`PascalCase`
- 接口名：`PascalCase`（无 `I` 前缀）
- 常量：`UPPER_SNAKE_CASE`
- 环境变量：`TELAGENT_` 或 `CLAWNET_` 前缀

### 导入约定
- **所有 `.ts` 文件中的相对导入必须使用 `.js` 扩展名**（ESM 要求）
- 示例：`import { foo } from './bar.js';`

### 错误处理
- 使用 `TelagentError` + `ErrorCodes`（来自 `@telagent/protocol`）
- API 返回 RFC7807 `ProblemDetail` 格式
- `ok(res, data, meta)` 用于成功响应

### ClawNet SDK 导入
```typescript
import { ClawNetClient } from '@claw-network/sdk';
import { ClawNetNode } from '@claw-network/node';
```

---

## 文件清单总览

### 新增文件（共 15 个）

| # | 路径 | 用途 |
|---|---|---|
| 1 | `packages/node/src/clawnet/discovery.ts` | ClawNet Node 自动发现 + 自动启动 |
| 2 | `packages/node/src/clawnet/managed-node.ts` | 嵌入式 ClawNet Node 生命周期管理 |
| 3 | `packages/node/src/clawnet/verify-passphrase.ts` | 启动时 passphrase 验证 |
| 4 | `packages/node/src/clawnet/gateway-service.ts` | ClawNetGatewayService |
| 5 | `packages/node/src/clawnet/session-manager.ts` | Session-Based 授权 |
| 6 | `packages/node/src/clawnet/nonce-manager.ts` | Nonce 本地计数器 + 同步 |
| 7 | `packages/node/src/clawnet/index.ts` | barrel export |
| 8 | `packages/node/src/storage/telagent-paths.ts` | ~/.telagent 路径解析 + 目录初始化 |
| 9 | `packages/node/src/storage/secret-store.ts` | 加密文件写入/读取/权限管理 |
| 10 | `packages/node/src/storage/mnemonic-store.ts` | 助记词 scrypt+AES-256-GCM 加解密 |
| 11 | `packages/node/src/storage/passphrase-store.ts` | Passphrase 设备绑定密钥加解密 |
| 12 | `packages/node/src/storage/passphrase-resolver.ts` | Passphrase 解析优先级链 |
| 13 | `packages/node/src/api/routes/session.ts` | Session 管理 API 端点 |
| 14 | `packages/node/src/api/routes/clawnet.ts` | ClawNet 代理 API 端点 |
| 15 | `packages/protocol/src/content-schemas.ts` | ContentType payload 结构定义 |

### 修改文件（共 9 个）

| # | 路径 | 变更摘要 |
|---|---|---|
| 1 | `packages/protocol/src/types.ts` | 扩展 `ContentType` 联合类型 |
| 2 | `packages/node/package.json` | 新增 3 个依赖 |
| 3 | `packages/node/src/config.ts` | 删除 `TELAGENT_DATA_DIR` / `TELAGENT_SELF_DID`；新增 ClawNet 配置；迁移到 `TELAGENT_HOME` |
| 4 | `packages/node/src/services/chain-config.ts` | 删除 `selfDid` 字段；移除 `identity` 合约地址要求 |
| 5 | `packages/node/src/services/abis.ts` | 删除 `CLAW_IDENTITY_ABI`、`CLAW_TOKEN_ABI`、`CLAW_ROUTER_ABI` |
| 6 | `packages/node/src/services/contract-provider.ts` | 删除 `identity`、`token`、`router` 合约实例 |
| 7 | `packages/node/src/services/identity-adapter-service.ts` | 改为委托 `ClawNetGatewayService` |
| 8 | `packages/node/src/api/types.ts` | RuntimeContext 新增 `clawnetGateway`、`sessionManager` |
| 9 | `packages/node/src/app.ts` | 重构启动/停止流程：ClawNet 发现 → 验证 → Session → 注入 |

### 删除代码（在修改文件中体现）

| 删除项 | 所在文件 |
|---|---|
| `CLAW_IDENTITY_ABI` | `abis.ts` |
| `CLAW_TOKEN_ABI` | `abis.ts` |
| `CLAW_ROUTER_ABI` | `abis.ts` |
| `ContractProvider.identity` | `contract-provider.ts` |
| `ContractProvider.token` | `contract-provider.ts` |
| `ContractProvider.router` | `contract-provider.ts` |
| `selfDid` 字段 | `chain-config.ts` |
| `TELAGENT_DATA_DIR` 读取 | `config.ts` |
| `TELAGENT_SELF_DID` 读取 | `config.ts` |
| `contracts.identity` / `contracts.token` 相关 import | `contract-provider.ts` |

---

## Phase 0 — 破坏性清理 & 数据目录迁移

### Step 0.1 — 删除旧环境变量与配置字段

**目标**: 删除 `selfDid` 配置字段，并在启动时检测旧环境变量拒绝启动。

#### 0.1.1 修改 `packages/node/src/services/chain-config.ts`

**当前代码**:
```typescript
export const ChainConfigSchema = z.object({
  rpcUrl: z.string().min(1),
  chainId: z.number().int().positive(),
  contracts: ContractAddressesSchema,
  signer: SignerConfigSchema,
  selfDid: z.string().regex(/^did:claw:[A-Za-z0-9]+$/),
  finalityDepth: z.number().int().min(1).default(12),
});
```

**改为**:
```typescript
export const ChainConfigSchema = z.object({
  rpcUrl: z.string().min(1),
  chainId: z.number().int().positive(),
  contracts: ContractAddressesSchema,
  signer: SignerConfigSchema,
  // selfDid 已删除 — DID 从 ClawNet Node 获取，不再手动配置
  finalityDepth: z.number().int().min(1).default(12),
});
```

同时修改 `ContractAddressesSchema`，移除 `identity` 必填要求（后续由 ClawNet 处理）：

**当前代码**:
```typescript
export const ContractAddressesSchema = z.object({
  identity: EthAddress,
  token: EthAddress,
  router: EthAddress.optional(),
  telagentGroupRegistry: EthAddress,
});
```

**改为**:
```typescript
export const ContractAddressesSchema = z.object({
  // identity: 已删除 — Identity 通过 ClawNet SDK 获取
  // token: 已删除 — Token 余额通过 ClawNet SDK 查询
  // router: 已删除 — Router 不再直连
  telagentGroupRegistry: EthAddress,
});
```

> **注意**: 仅保留 `telagentGroupRegistry`，这是 TelAgent 自有合约。

#### 0.1.2 修改 `packages/node/src/config.ts`

在 `loadConfigFromEnv()` 开头添加旧变量检测：

```typescript
export function loadConfigFromEnv(): AppConfig {
  // ── 破坏性变更检测 ────────────────────────────────────
  if (process.env.TELAGENT_DATA_DIR) {
    throw new Error(
      'TELAGENT_DATA_DIR is removed. Use TELAGENT_HOME instead. ' +
      'Default: ~/.telagent. See migration guide.'
    );
  }
  if (process.env.TELAGENT_SELF_DID) {
    throw new Error(
      'TELAGENT_SELF_DID is removed. DID is now obtained from ClawNet Node automatically. ' +
      'Remove this env var and ensure ClawNet Node is running.'
    );
  }
  // ── 旧合约地址检测 ────────────────────────────────────
  if (process.env.TELAGENT_IDENTITY_CONTRACT) {
    throw new Error(
      'TELAGENT_IDENTITY_CONTRACT is removed. Identity is now resolved via ClawNet SDK. ' +
      'Remove this env var.'
    );
  }
  if (process.env.TELAGENT_TOKEN_CONTRACT) {
    throw new Error(
      'TELAGENT_TOKEN_CONTRACT is removed. Token balance is now queried via ClawNet SDK. ' +
      'Remove this env var.'
    );
  }
  // ... 继续原有逻辑 ...
}
```

删除以下行：
```typescript
// 删除:
const dataDir = process.env.TELAGENT_DATA_DIR || '.telagent';
mkdirSync(dataDir, { recursive: true });

// 删除 chain parse 中的:
selfDid: process.env.TELAGENT_SELF_DID,

// 删除 contracts 中的:
identity: process.env.TELAGENT_IDENTITY_CONTRACT,
token: process.env.TELAGENT_TOKEN_CONTRACT,
router: process.env.TELAGENT_ROUTER_CONTRACT,
```

替换为基于 `TELAGENT_HOME` 的路径（详见 Step 0.4）。

**验证**: `pnpm --filter @telagent/node typecheck` 会报错（因为 `selfDid` 引用还存在），这在 Step 4.2 中修复。

---

### Step 0.2 — 删除 CLAW_IDENTITY_ABI & ContractProvider.identity

**目标**: 清除所有直连 ClawNet Identity/Token/Router 合约的代码。

#### 0.2.1 修改 `packages/node/src/services/abis.ts`

删除 `CLAW_IDENTITY_ABI`、`CLAW_TOKEN_ABI`、`CLAW_ROUTER_ABI`，仅保留 `TELAGENT_GROUP_REGISTRY_ABI`：

**改为**:
```typescript
import type { InterfaceAbi } from 'ethers';

// ClawNet 合约 ABI 已全部删除 — Identity/Token/Router 通过 ClawNet SDK 访问
// 仅保留 TelAgent 自有合约

export const TELAGENT_GROUP_REGISTRY_ABI: InterfaceAbi = [
  'function createGroup(bytes32 groupId, bytes32 creatorDidHash, string groupDomain, bytes32 domainProofHash, bytes32 initialMlsStateHash)',
  'function inviteMember(bytes32 groupId, bytes32 inviteId, bytes32 inviterDidHash, bytes32 inviteeDidHash, bytes32 mlsCommitHash)',
  'function acceptInvite(bytes32 groupId, bytes32 inviteId, bytes32 inviteeDidHash, bytes32 mlsWelcomeHash)',
  'function removeMember(bytes32 groupId, bytes32 operatorDidHash, bytes32 memberDidHash, bytes32 mlsCommitHash)',
  'function getGroup(bytes32 groupId) view returns (tuple(bytes32 creatorDidHash, string groupDomain, bytes32 domainProofHash, bytes32 mlsStateHash, uint64 createdAt, uint64 updatedAt, bool active))',
  'function getMemberState(bytes32 groupId, bytes32 memberDidHash) view returns (uint8)',
  'event GroupCreated(bytes32 indexed groupId, bytes32 indexed creatorDidHash, bytes32 indexed domainHash, bytes32 domainProofHash, uint256 blockNumber)',
  'event MemberInvited(bytes32 indexed groupId, bytes32 indexed inviteId, bytes32 indexed inviterDidHash, bytes32 inviteeDidHash, bytes32 mlsCommitHash)',
  'event MemberAccepted(bytes32 indexed groupId, bytes32 indexed inviteId, bytes32 indexed memberDidHash, bytes32 mlsWelcomeHash)',
  'event MemberRemoved(bytes32 indexed groupId, bytes32 indexed memberDidHash, bytes32 indexed operatorDidHash, bytes32 mlsCommitHash)',
];
```

#### 0.2.2 修改 `packages/node/src/services/contract-provider.ts`

删除 `identity`、`token`、`router` 合约实例，删除相关 import。

**改为**:
```typescript
import { readFileSync } from 'node:fs';

import {
  Contract,
  HDNodeWallet,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  type Signer,
} from 'ethers';

import type { ChainConfig } from './chain-config.js';
import { TELAGENT_GROUP_REGISTRY_ABI } from './abis.js';

export class ContractProvider {
  readonly provider: JsonRpcProvider;
  readonly signer: NonceManager;
  readonly signerAddress: string;

  // 仅保留 TelAgent 自有合约
  readonly telagentGroupRegistry: Contract;

  constructor(readonly config: ChainConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: 'clawnet',
    });

    const signer = this.resolveSigner();
    this.signer = new NonceManager(signer);
    this.signerAddress = signer.address;

    this.telagentGroupRegistry = new Contract(
      config.contracts.telagentGroupRegistry,
      TELAGENT_GROUP_REGISTRY_ABI,
      this.signer,
    );
  }

  async destroy(): Promise<void> {
    this.provider.destroy();
  }

  private resolveSigner(): Wallet {
    const cfg = this.config.signer;

    if (cfg.type === 'env') {
      const privateKey = process.env[cfg.envVar];
      if (!privateKey) {
        throw new Error(`Signer env var ${cfg.envVar} is not set`);
      }
      return new Wallet(privateKey, this.provider);
    }

    if (cfg.type === 'keyfile') {
      const raw = readFileSync(cfg.path, 'utf8').trim();
      let privateKey: string;
      try {
        const parsed = JSON.parse(raw) as { privateKey?: string };
        privateKey = parsed.privateKey ?? raw;
      } catch {
        privateKey = raw;
      }
      return new Wallet(privateKey, this.provider);
    }

    const mnemonic = process.env[cfg.envVar];
    if (!mnemonic) {
      throw new Error(`Mnemonic env var ${cfg.envVar} is not set`);
    }
    const path = `m/44'/60'/0'/0/${cfg.index}`;
    const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path);
    return new Wallet(wallet.privateKey, this.provider);
  }
}
```

> **注意**: `GasService` 仍需要 `ContractProvider.provider`（用于 gas 预检），但不再需要 `.identity` 和 `.token`。

#### 0.2.3 修改 `packages/node/src/services/gas-service.ts`

删除 `getTokenBalance()` 方法（Token 余额改为通过 ClawNet SDK 查询），仅保留 `getNativeGasBalance()` 和 `preflight()` 用于群组操作的 gas 预检。

**改为**:
```typescript
import { ErrorCodes, TelagentError } from '@telagent/protocol';
import { formatEther } from 'ethers';

import type { ContractProvider } from './contract-provider.js';

export interface GasPreflightResult {
  signer: string;
  nativeBalanceWei: bigint;
  estimatedGas: bigint;
  estimatedFeeWei: bigint;
  gasPriceWei: bigint;
  sufficient: boolean;
}

export class GasService {
  constructor(private readonly contracts: ContractProvider) {}

  async getNativeGasBalance(address?: string): Promise<bigint> {
    return this.contracts.provider.getBalance(address ?? this.contracts.signerAddress);
  }

  // getTokenBalance() 已删除 — Token 余额通过 ClawNet SDK 查询:
  // clawnetGateway.getBalance({ did })

  async preflight(tx: { to: string; data: string }): Promise<GasPreflightResult> {
    const signer = this.contracts.signerAddress;

    const [nativeBalanceWei, feeData, estimatedGas] = await Promise.all([
      this.contracts.provider.getBalance(signer),
      this.contracts.provider.getFeeData(),
      this.contracts.provider.estimateGas({ from: signer, to: tx.to, data: tx.data }),
    ]);

    const gasPriceWei = feeData.gasPrice ?? 0n;
    const estimatedFeeWei = estimatedGas * gasPriceWei;
    const sufficient = nativeBalanceWei >= estimatedFeeWei;

    return {
      signer,
      nativeBalanceWei,
      estimatedGas,
      estimatedFeeWei,
      gasPriceWei,
      sufficient,
    };
  }

  assertSufficient(result: GasPreflightResult): void {
    if (result.sufficient) {
      return;
    }

    throw new TelagentError(
      ErrorCodes.INSUFFICIENT_GAS_TOKEN_BALANCE,
      `Insufficient gas token balance: have ${formatEther(result.nativeBalanceWei)} native, need ${formatEther(result.estimatedFeeWei)} native`,
    );
  }
}
```

---

### Step 0.3 — 创建 ~/.telagent 数据目录模块

**目标**: 创建 `TelagentStoragePaths` 路径解析 + 目录初始化 + 权限管理模块。

#### 创建 `packages/node/src/storage/telagent-paths.ts`

```typescript
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { mkdir, chmod, stat } from 'node:fs/promises';

const DIR_MODE_OWNER_ONLY = 0o700;   // rwx------

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
  groupIndexerDb: string; // ~/.telagent/data/group-indexer.sqlite
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
    groupIndexerDb: resolve(r, 'data', 'group-indexer.sqlite'),
  };
}

export async function ensureTelagentDirs(paths: TelagentStoragePaths): Promise<void> {
  for (const dir of [paths.root, paths.secrets, paths.keys, paths.data, paths.logs, paths.cache]) {
    await mkdir(dir, { recursive: true });
  }
  // 对 root 和 secrets 强制设置严格权限
  await chmod(paths.root, DIR_MODE_OWNER_ONLY);
  await chmod(paths.secrets, DIR_MODE_OWNER_ONLY);
  await chmod(paths.keys, DIR_MODE_OWNER_ONLY);
}

/**
 * 启动时校验 secrets/ 目录权限
 * 如果权限过宽（如 0o644），尝试修复；修复失败则拒绝启动
 */
export async function verifySecretsPermissions(paths: TelagentStoragePaths): Promise<void> {
  // Docker 容器中以 root 运行时跳过权限校验（RFC §5.4 权限异常处理表）
  if (process.platform === 'linux' && process.getuid?.() === 0) {
    return;  // 容器环境，使用环境变量传递 secrets
  }

  for (const dir of [paths.root, paths.secrets]) {
    try {
      const s = await stat(dir);
      const mode = s.mode & 0o777;

      // 检查文件 owner 是否为当前用户（RFC §5.4：root 创建后切换用户场景）
      if (process.getuid && s.uid !== process.getuid()) {
        console.warn(
          `[telagent] WARNING: ${dir} is owned by uid ${s.uid}, but running as uid ${process.getuid()}. ` +
          'This may cause permission errors. Consider running: chown -R $(whoami) ' + dir,
        );
      }

      if (mode & 0o077) {  // group/other 有任何权限
        try {
          await chmod(dir, DIR_MODE_OWNER_ONLY);
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

---

### Step 0.4 — 迁移 config.ts 到 TELAGENT_HOME

**目标**: `AppConfig` 基于 `TELAGENT_HOME` 解析所有路径，新增 ClawNet 配置接口。

#### 修改 `packages/node/src/config.ts`

在 `AppConfig` 接口中：

1. 删除 `dataDir: string;`
2. 新增以下字段：

```typescript
import type { TelagentStoragePaths } from './storage/telagent-paths.js';

export interface ClawNetConfig {
  nodeUrl?: string;       // 显式指定时使用；未设置则自动发现
  passphrase?: string;    // 运行时从 passphrase resolver 获取
  apiKey?: string;
  timeoutMs: number;      // 默认 30000
  autoDiscover: boolean;  // 默认 true
  autoStart: boolean;     // 默认 true
}

export interface AppConfig {
  host: string;
  port: number;
  paths: TelagentStoragePaths;             // 替代旧 dataDir
  mailboxCleanupIntervalSec: number;
  mailboxStore: MailboxStoreConfig;
  chain: ChainConfig;
  clawnet: ClawNetConfig;                  // 新增
  federation: FederationConfig;
  monitoring: MonitoringConfig;
  domainProof: DomainProofConfig;
  federationSlo: FederationSloConfig;
}
```

在 `loadConfigFromEnv()` 中：

```typescript
import { resolveTelagentPaths, defaultTelagentHome } from './storage/telagent-paths.js';

export function loadConfigFromEnv(): AppConfig {
  // ── 破坏性变更检测（见 Step 0.1.2）──────────────
  // ...

  const paths = resolveTelagentPaths();

  const host = process.env.TELAGENT_API_HOST || '127.0.0.1';
  const port = Number(process.env.TELAGENT_API_PORT || 9529);

  const chain = ChainConfigSchema.parse({
    rpcUrl: process.env.TELAGENT_CHAIN_RPC_URL,
    chainId: Number(process.env.TELAGENT_CHAIN_ID || 7625),
    contracts: {
      telagentGroupRegistry: process.env.TELAGENT_GROUP_REGISTRY_CONTRACT,
    },
    signer: {
      type: process.env.TELAGENT_SIGNER_TYPE || 'env',
      envVar: process.env.TELAGENT_SIGNER_ENV || 'TELAGENT_PRIVATE_KEY',
      path: process.env.TELAGENT_SIGNER_PATH,
      index: Number(process.env.TELAGENT_SIGNER_INDEX || 0),
    },
    finalityDepth: Number(process.env.TELAGENT_FINALITY_DEPTH || 12),
  });

  // ClawNet 配置
  const clawnet: ClawNetConfig = {
    nodeUrl: process.env.TELAGENT_CLAWNET_NODE_URL || undefined,
    apiKey: process.env.TELAGENT_CLAWNET_API_KEY || undefined,
    timeoutMs: Number(process.env.TELAGENT_CLAWNET_TIMEOUT_MS || 30_000),
    autoDiscover: parseBoolean(process.env.TELAGENT_CLAWNET_AUTO_DISCOVER, true),
    autoStart: parseBoolean(process.env.TELAGENT_CLAWNET_AUTO_START, true),
    // passphrase 在 start() 中通过 passphrase-resolver 获取，不在这里设置
  };

  // mailbox 路径基于 paths
  const mailboxStore: MailboxStoreConfig = {
    backend: mailboxStoreBackend,
    sqlitePath: process.env.TELAGENT_MAILBOX_SQLITE_PATH || paths.mailboxDb,
  };

  // ... 其余保持不变，但将 dataDir 替换为 paths ...

  return {
    host,
    port,
    paths,                           // 替代旧 dataDir
    mailboxCleanupIntervalSec: ...,
    mailboxStore,
    chain,
    clawnet,                         // 新增
    federation: { ... },
    monitoring: { ... },
    domainProof: { ... },
    federationSlo: { ... },
  };
}
```

> **旧 `resolveDataPath()` 函数**: 删除。所有路径通过 `TelagentStoragePaths` 访问。

**验证命令**:
```bash
cd packages/node && pnpm typecheck
```
此时会有编译错误（`dataDir` 引用、`selfDid` 引用等），将在后续 Step 中逐一修复。



---

## Phase 1 — ClawNet 发现 & 自动启动

### Step 1.1 — 创建 ClawNet Discovery 模块

**目标**: 按优先级发现 ClawNet Node：显式配置 → config.yaml → 默认探测 → 自动启动 → 全新初始化。

#### 创建 `packages/node/src/clawnet/discovery.ts`

```typescript
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';

export interface ClawNetDiscoveryResult {
  found: boolean;
  nodeUrl?: string;
  source:
    | 'explicit-config'
    | 'clawnet-config-yaml'
    | 'default-probe'
    | 'auto-started'
    | 'auto-initialized';
  clawnetHome?: string;
  managedNode?: any;  // ClawNetNode instance or null
}

const logger = console;  // 替换为项目实际 logger

/**
 * ClawNet Node 发现 + 自动启动
 *
 * 优先级（RFC §5.1）：
 * 1. 显式 URL（TELAGENT_CLAWNET_NODE_URL）
 * 2. 读取 $CLAWNET_HOME/config.yaml
 * 3. 默认探测 http://127.0.0.1:9528
 * 4. 自动启动嵌入式 ClawNet Node
 * 5. 全新初始化 + 启动
 */
export async function discoverOrStartClawNet(
  explicitUrl?: string,
  passphrase?: string,
  options?: { autoStart?: boolean; autoDiscover?: boolean },
): Promise<ClawNetDiscoveryResult> {
  const clawnetHome = process.env.CLAWNET_HOME ?? resolve(homedir(), '.clawnet');
  const autoStart = options?.autoStart ?? true;

  // ── 1. 显式配置 ─────────────────────────────────────
  if (explicitUrl) {
    logger.info('[telagent] ClawNet discovery: using explicit URL %s', explicitUrl);
    return { found: true, nodeUrl: explicitUrl, source: 'explicit-config' };
  }

  // ── 2. 读取本地 ClawNet config.yaml ─────────────────
  const configPath = resolve(clawnetHome, 'config.yaml');
  try {
    const raw = readFileSync(configPath, 'utf8');
    // 简易 YAML 解析（提取 api.host 和 api.port）
    // 生产环境应使用 yaml 库
    const hostMatch = raw.match(/host:\s*['"]?([^'"\n]+)/);
    const portMatch = raw.match(/port:\s*(\d+)/);
    const host = hostMatch?.[1]?.trim() ?? '127.0.0.1';
    const port = portMatch?.[1] ?? '9528';
    const url = `http://${host}:${port}`;

    if (await probeNodeHealth(url)) {
      logger.info('[telagent] ClawNet discovery: found via %s', configPath);
      return { found: true, nodeUrl: url, source: 'clawnet-config-yaml', clawnetHome };
    }
  } catch {
    // config.yaml 不存在或不完整，继续
  }

  // ── 3. 默认地址探测 ─────────────────────────────────
  const defaultUrl = 'http://127.0.0.1:9528';
  if (await probeNodeHealth(defaultUrl)) {
    logger.info('[telagent] ClawNet discovery: found via default probe %s', defaultUrl);
    return { found: true, nodeUrl: defaultUrl, source: 'default-probe' };
  }

  // ── 4 & 5. 自动启动 ────────────────────────────────
  if (!autoStart) {
    throw new Error(
      '[telagent] FATAL: ClawNet Node not found and TELAGENT_CLAWNET_AUTO_START=false. ' +
      'Start a ClawNet Node manually or set TELAGENT_CLAWNET_NODE_URL.'
    );
  }

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
    logger.info('[telagent] No ClawNet installation found — initializing at %s', clawnetHome);
    // 调用 ManagedClawNetNode.initAndStart()
  }

  // 启动嵌入式 ClawNet Node
  const { ManagedClawNetNode } = await import('./managed-node.js');
  const managedNode = new ManagedClawNetNode(clawnetHome, passphrase);

  if (alreadyInitialized) {
    await managedNode.start();
  } else {
    await managedNode.initAndStart();
  }

  const did = await managedNode.getDid();
  logger.info('[telagent] Embedded ClawNet Node started — DID: %s', did);

  return {
    found: true,
    nodeUrl: defaultUrl,
    source: alreadyInitialized ? 'auto-started' : 'auto-initialized',
    clawnetHome,
    managedNode,
  };
}

/**
 * 检测 ClawNet Node 健康状态
 * 超时 3 秒
 */
export async function probeNodeHealth(url: string): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/api/v1/node`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return false;
    const body = await resp.json() as { data?: { did?: string } };
    return typeof body?.data?.did === 'string';
  } catch {
    return false;
  }
}
```

---

### Step 1.2 — 创建嵌入式 ClawNet Node 管理器

**目标**: 封装 `@claw-network/node` 的 `ClawNetNode` 类，提供 init / start / stop 生命周期管理。

#### 创建 `packages/node/src/clawnet/managed-node.ts`

```typescript
/**
 * 嵌入式 ClawNet Node 生命周期管理
 *
 * 当 TelAgent 自动启动 ClawNet Node 时，创建此实例。
 * TelAgent.stop() 时调用 managedNode.stop() 同步关闭。
 */
export class ManagedClawNetNode {
  private node: any = null;  // ClawNetNode 实例

  constructor(
    private readonly dataDir: string,
    private readonly passphrase: string,
    private readonly apiPort: number = 9528,
  ) {}

  /**
   * 在已有数据目录上启动 ClawNet Node
   * 如果指定端口被占用，自动尝试 +1 端口（最多 5 次）（RFC §7 风险表）
   */
  async start(): Promise<void> {
    const { ClawNetNode } = await import('@claw-network/node');
    let port = this.apiPort;
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        this.node = new ClawNetNode({
          dataDir: this.dataDir,
          passphrase: this.passphrase,
          api: { host: '127.0.0.1', port, enabled: true },
        });
        await this.node.start();
        if (port !== this.apiPort) {
          console.warn('[telagent] ClawNet Node started on fallback port %d (original %d was busy)', port, this.apiPort);
        }
        return;
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? '';
        if ((msg.includes('EADDRINUSE') || msg.includes('address already in use')) && attempt < maxAttempts - 1) {
          port++;
          continue;
        }
        throw err;
      }
    }
    throw new Error(`[telagent] FATAL: Could not start ClawNet Node — ports ${this.apiPort}-${port} all in use`);
  }

  /**
   * 获取实际使用的 API 端口（端口回退后可能与构造参数不同）
   */
  getApiPort(): number {
    return this.node?.apiPort ?? this.apiPort;
  }

  /**
   * 全新初始化 + 启动（首次运行）
   * 返回生成的助记词（调用者负责加密存储）
   */
  async initAndStart(): Promise<{ mnemonic: string }> {
    const { ClawNetNode } = await import('@claw-network/node');
    this.node = new ClawNetNode({
      dataDir: this.dataDir,
      passphrase: this.passphrase,
      api: { host: '127.0.0.1', port: this.apiPort, enabled: true },
    });
    // ClawNetNode.init() 执行密钥生成，返回助记词
    const initResult = await this.node.init();
    await this.node.start();
    return { mnemonic: initResult.mnemonic };
  }

  async stop(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.node = null;
    }
  }

  async getDid(): Promise<string> {
    if (!this.node) throw new Error('ClawNet Node not started');
    return this.node.getDid();
  }

  getEventStore(): any | undefined {
    return this.node?.eventStore;
  }

  isRunning(): boolean {
    return this.node !== null;
  }
}
```

---

### Step 1.3 — 创建 Passphrase 验证模块

**目标**: 启动时验证 passphrase 与 ClawNet Node keystore 是否匹配。

#### 创建 `packages/node/src/clawnet/verify-passphrase.ts`

```typescript
/**
 * 启动时 Passphrase 验证
 *
 * 对所有场景都做一次验证（包括嵌入式启动）。
 * 验证方式：用 passphrase 尝试一个需要签名的操作。
 *
 * 结果：
 * - valid=true, error=undefined → 验证通过
 * - valid=false, error="..." → 验证失败（passphrase 不匹配）→ 拒绝启动
 * - valid=true, error="..." → 验证不确定（网络问题等）→ 打印警告，不阻塞
 */
export async function verifyPassphrase(
  nodeUrl: string,
  passphrase: string,
): Promise<{ valid: boolean; did?: string; error?: string }> {
  try {
    const { ClawNetClient } = await import('@claw-network/sdk');
    const client = new ClawNetClient({ baseUrl: nodeUrl });

    // 1. 获取 Node 的 DID（只读，不需要 passphrase）
    const nodeResp = await fetch(`${nodeUrl}/api/v1/node`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!nodeResp.ok) {
      return { valid: true, error: `ClawNet Node returned ${nodeResp.status}` };
    }
    const nodeBody = await nodeResp.json() as { data?: { did?: string } };
    const did = nodeBody?.data?.did;
    if (!did) {
      return { valid: true, error: 'Cannot retrieve DID from ClawNet Node' };
    }

    // 2. 用 passphrase 尝试获取 nonce（内部会解密 keystore 验证密码）
    await client.wallet.getNonce({ did, passphrase });

    return { valid: true, did };
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);

    // 解密失败 = passphrase 不匹配
    if (msg.includes('decrypt') || msg.includes('passphrase') || msg.includes('password')) {
      return { valid: false, error: `Passphrase mismatch: ${msg}` };
    }

    // 其他错误（网络问题等）不阻塞启动
    return { valid: true, error: `Passphrase verification inconclusive: ${msg}` };
  }
}
```

---

## Phase 2 — 安全存储

### Step 2.1 — 创建加密存储基础设施

**目标**: 创建安全文件写入工具（原子写入 + 权限锁定）。

#### 创建 `packages/node/src/storage/secret-store.ts`

```typescript
import { writeFile, stat, chmod, rename, unlink } from 'node:fs/promises';

const FILE_MODE_OWNER_ONLY = 0o600;  // rw-------

/**
 * 安全写入文件：先写临时文件 → chmod → rename（原子操作）
 * 解决"写入后再改权限"之间的竞态窗口问题
 */
export async function writeSecretFile(filePath: string, content: string | Buffer): Promise<void> {
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    // 1. 创建临时文件
    await writeFile(tmpPath, '', { mode: FILE_MODE_OWNER_ONLY, flag: 'wx' });

    // 2. 防御性权限检查（umask 可能导致偏移）
    const s = await stat(tmpPath);
    const actualMode = s.mode & 0o777;
    if (actualMode !== FILE_MODE_OWNER_ONLY) {
      await chmod(tmpPath, FILE_MODE_OWNER_ONLY);
    }

    // 3. 写入实际内容
    await writeFile(tmpPath, content, { mode: FILE_MODE_OWNER_ONLY });

    // 4. 原子 rename
    await rename(tmpPath, filePath);
  } catch (error) {
    try { await unlink(tmpPath); } catch { /* ignore cleanup failure */ }
    throw error;
  }
}

/**
 * 通用加密记录格式
 */
export interface EncryptedRecord {
  v: 1;
  kdf: 'scrypt';
  binding?: 'device';  // passphrase 使用设备绑定密钥
  salt?: string;        // hex（scrypt kdf 用）
  nonce: string;        // hex
  ciphertext: string;   // hex
  tag: string;          // hex
  createdAt: string;    // ISO 8601
}
```

---

### Step 2.2 — 创建助记词加密存储

**目标**: 使用 `scrypt + AES-256-GCM` 加密/解密助记词。

#### 创建 `packages/node/src/storage/mnemonic-store.ts`

```typescript
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { TelagentStoragePaths } from './telagent-paths.js';
import { writeSecretFile, type EncryptedRecord } from './secret-store.js';

/**
 * 使用 passphrase 加密助记词后安全存储
 * 加密方案：scrypt KDF => AES-256-GCM
 *
 * scrypt 参数：N=2^17, r=8, p=1 (OWASP 推荐)
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
  const ciphertext = Buffer.concat([cipher.update(mnemonic, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const record: EncryptedRecord = {
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
  const record = JSON.parse(raw) as EncryptedRecord;

  if (record.v !== 1 || record.kdf !== 'scrypt' || !record.salt) {
    throw new Error('Unsupported mnemonic encryption format');
  }

  const salt = Buffer.from(record.salt, 'hex');
  const key = scryptSync(passphrase, salt, 32, { N: 2 ** 17, r: 8, p: 1 });
  const nonce = Buffer.from(record.nonce, 'hex');
  const ciphertext = Buffer.from(record.ciphertext, 'hex');
  const tag = Buffer.from(record.tag, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
```

---

### Step 2.3 — 创建 Passphrase 安全存储

**目标**: 使用设备绑定密钥（machine-id + hostname + uid）加密 passphrase。

#### 创建 `packages/node/src/storage/passphrase-store.ts`

```typescript
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import type { TelagentStoragePaths } from './telagent-paths.js';
import { writeSecretFile, type EncryptedRecord } from './secret-store.js';

/**
 * 派生设备绑定密钥
 *
 * HKDF(SHA-256, machine-id || hostname || uid, "telagent-passphrase-encryption")
 *
 * 安全说明：
 * - 非高安全性方案（root 可以重建密钥）
 * - 防止 secrets 文件被拷贝到其他机器后直接使用
 * - v2 将引入系统 Keyring
 */
function deriveDeviceBoundKey(): Buffer {
  let machineId = 'unknown';
  try {
    // Linux: /etc/machine-id
    machineId = readFileSync('/etc/machine-id', 'utf8').trim();
  } catch {
    try {
      // macOS: IOPlatformUUID
      const { execSync } = require('node:child_process');
      machineId = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/{print $3}' | tr -d '\"'",
        { encoding: 'utf8' },
      ).trim();
    } catch { /* fallback to hostname */ }
  }

  const input = `${machineId}:${hostname()}:${userInfo().uid}`;
  return createHash('sha256')
    .update('telagent-passphrase-encryption')
    .update(input)
    .digest();
}

/**
 * 使用设备绑定密钥加密 passphrase 后存储
 */
export async function savePassphrase(
  paths: TelagentStoragePaths,
  passphrase: string,
): Promise<void> {
  const key = deriveDeviceBoundKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(passphrase, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const record: EncryptedRecord = {
    v: 1,
    kdf: 'scrypt',     // 标识加密方案（虽然此处用设备密钥非 scrypt）
    binding: 'device',  // 标识为设备绑定
    nonce: nonce.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    tag: tag.toString('hex'),
    createdAt: new Date().toISOString(),
  };

  await writeSecretFile(paths.passphraseFile, JSON.stringify(record, null, 2));
}

/**
 * 从文件读取并解密 passphrase
 * 返回 null 如果文件不存在或解密失败
 */
export async function loadPassphrase(paths: TelagentStoragePaths): Promise<string | null> {
  try {
    const raw = await readFile(paths.passphraseFile, 'utf8');
    const record = JSON.parse(raw) as EncryptedRecord;
    const key = deriveDeviceBoundKey();
    const nonce = Buffer.from(record.nonce, 'hex');
    const ciphertext = Buffer.from(record.ciphertext, 'hex');
    const tag = Buffer.from(record.tag, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;  // 文件不存在或解密失败（可能换了设备）
  }
}
```

---

### Step 2.4 — 创建 Passphrase 解析优先级模块

**目标**: 按 `环境变量 → 加密文件 → null` 的优先级解析 passphrase。

#### 创建 `packages/node/src/storage/passphrase-resolver.ts`

```typescript
import type { TelagentStoragePaths } from './telagent-paths.js';
import { loadPassphrase } from './passphrase-store.js';

/**
 * Passphrase 解析优先级（RFC §5.4）：
 *
 * 1. 环境变量 TELAGENT_CLAWNET_PASSPHRASE → 最高优先
 * 2. 本地加密文件 ~/.telagent/secrets/passphrase.enc → 设备绑定密钥解密
 * 3. 以上均无 → 返回 null（后续由 discoverOrStartClawNet 决定是否拒绝启动）
 */
export async function resolvePassphrase(
  paths: TelagentStoragePaths,
): Promise<string | null> {
  // 1. 环境变量
  const envPassphrase = process.env.TELAGENT_CLAWNET_PASSPHRASE;
  if (envPassphrase) {
    return envPassphrase;
  }

  // 2. 加密文件
  const stored = await loadPassphrase(paths);
  if (stored) {
    return stored;
  }

  // 3. 未找到
  return null;
}
```


---

## Phase 3 — Session-Based 授权 & Nonce 管理

### Step 3.1 — 创建 SessionManager

**目标**: 实现 Unlock Session 机制。passphrase 只传一次，后续通过 session token 授权。

#### 创建 `packages/node/src/clawnet/session-manager.ts`

```typescript
import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

/**
 * ClawNet 写操作的 scope 类型
 */
export type OperationScope =
  | 'transfer'
  | 'escrow'
  | 'market'
  | 'contract'
  | 'reputation'
  | 'identity';

const ALL_SCOPES: OperationScope[] = [
  'transfer', 'escrow', 'market', 'contract', 'reputation', 'identity',
];

interface Session {
  tokenHash: Buffer;          // 存储 hash 而非明文 token
  did: string;
  passphrase: string;         // 仅内存中持有
  scope: OperationScope[];
  expiresAt: number;          // Unix ms
  createdAt: number;
  operationsUsed: number;
  maxOperations?: number;
}

export interface UnlockParams {
  passphrase: string;
  did: string;
  ttlSeconds?: number;
  scope?: OperationScope[];
  maxOperations?: number;
  validatePassphrase: (did: string, passphrase: string) => Promise<boolean>;
}

export interface UnlockResult {
  sessionToken: string;
  expiresAt: Date;
  scope: OperationScope[];
}

export interface ResolveResult {
  did: string;
  passphrase: string;
}

export interface SessionInfo {
  active: boolean;
  expiresAt: Date;
  scope: OperationScope[];
  operationsUsed: number;
  createdAt: Date;
}

export class SessionManager {
  private sessions = new Map<string, Session>();  // key = tokenHash hex
  private cleanupTimer: ReturnType<typeof setInterval>;

  // 安全常量
  private static readonly TOKEN_BYTES = 32;
  private static readonly TOKEN_PREFIX = 'tses_';
  private static readonly DEFAULT_TTL_MS = 30 * 60 * 1000;       // 30 分钟
  private static readonly MAX_TTL_MS = 24 * 60 * 60 * 1000;      // 24 小时上限
  private static readonly MAX_CONCURRENT_SESSIONS = 3;
  private static readonly CLEANUP_INTERVAL_MS = 60 * 1000;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.evictExpired(),
      SessionManager.CLEANUP_INTERVAL_MS,
    );
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * 解锁：验证 passphrase 后创建 session
   */
  async unlock(params: UnlockParams): Promise<UnlockResult> {
    this.evictExpired();
    if (this.sessions.size >= SessionManager.MAX_CONCURRENT_SESSIONS) {
      throw new Error('Too many active sessions. Lock an existing session first.');
    }

    // 验证 passphrase
    const valid = await params.validatePassphrase(params.did, params.passphrase);
    if (!valid) {
      throw new Error('Invalid passphrase');
    }

    // 生成 token
    const tokenRaw = randomBytes(SessionManager.TOKEN_BYTES);
    const token = SessionManager.TOKEN_PREFIX + tokenRaw.toString('base64url');
    const tokenHash = this.hashToken(token);

    // 计算 TTL
    const ttlMs = Math.min(
      (params.ttlSeconds ?? 1800) * 1000,
      SessionManager.MAX_TTL_MS,
    );
    const scope = params.scope?.length ? params.scope : ALL_SCOPES;

    const session: Session = {
      tokenHash,
      did: params.did,
      passphrase: params.passphrase,
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
   * 从 session token 解析出 passphrase
   */
  resolvePassphrase(token: string, requiredScope: OperationScope): ResolveResult {
    const tokenHash = this.hashToken(token);
    const key = tokenHash.toString('hex');
    const session = this.sessions.get(key);

    if (!session) {
      throw new Error('Invalid or expired session token');
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(key);
      throw new Error('Session expired. Please unlock again.');
    }

    if (!session.scope.includes(requiredScope)) {
      throw new Error(
        `Session does not have '${requiredScope}' scope. Authorized: ${session.scope.join(', ')}`,
      );
    }

    if (session.maxOperations && session.operationsUsed >= session.maxOperations) {
      this.sessions.delete(key);
      throw new Error('Session operation limit reached. Please unlock a new session.');
    }

    session.operationsUsed++;
    return { did: session.did, passphrase: session.passphrase };
  }

  /**
   * 查询 session 状态
   */
  getSessionInfo(token: string): SessionInfo | null {
    const tokenHash = this.hashToken(token);
    const session = this.sessions.get(tokenHash.toString('hex'));
    if (!session) return null;

    return {
      active: Date.now() <= session.expiresAt,
      expiresAt: new Date(session.expiresAt),
      scope: session.scope,
      operationsUsed: session.operationsUsed,
      createdAt: new Date(session.createdAt),
    };
  }

  /**
   * 锁定 / 销毁 session
   */
  lock(token: string): void {
    const tokenHash = this.hashToken(token);
    const key = tokenHash.toString('hex');
    const session = this.sessions.get(key);
    if (session) {
      // 安全擦除 passphrase
      session.passphrase = '\0'.repeat(session.passphrase.length);
      this.sessions.delete(key);
    }
  }

  /**
   * 销毁所有 session（Node 停止时调用）
   */
  lockAll(): void {
    for (const [, session] of this.sessions) {
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

**安全设计要点**:
- Token 存储为 HMAC hash，不存储明文
- Passphrase 仅在 Session 对象的内存中，过期/lock 时用 `\0` 覆写
- TTL 强制上限 24h，默认 30 分钟
- Scope 限制 + 操作次数限制 + 并发 session 限制（最多 3 个）
- Token 格式：`tses_` 前缀 + 32 bytes base64url

---

### Step 3.2 — 创建 NonceManager

**目标**: 本地 nonce 计数器 + ClawNet 同步 + nonce 冲突自动重试。

#### 创建 `packages/node/src/clawnet/nonce-manager.ts`

```typescript
/**
 * ClawNet Nonce 管理器
 *
 * ClawNet 所有写操作需要单调递增的 nonce。
 * 此模块在本地维护计数器，支持：
 * - next(did): 获取下一个 nonce（串行化）
 * - nextBatch(did, count): 批量预分配（如 accept-bid 消耗 5 个）
 * - rollback(did, nonce): 写失败后回滚
 * - sync(did): 从 ClawNet 同步当前已提交 nonce
 */

export class NonceManager {
  private counters = new Map<string, number>();
  private locks = new Map<string, Promise<void>>();

  constructor(
    private readonly eventStore?: any,    // 嵌入式模式: EventStore 实例
    private readonly clawnetClient?: any, // 外部模式: ClawNetClient 实例
  ) {}

  /**
   * 获取下一个可用 nonce（串行化同一 DID 的请求）
   */
  async next(did: string): Promise<number> {
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
   * 批量预分配 nonce
   * 返回起始 nonce，调用者使用 [start, start+1, ..., start+count-1]
   *
   * 已知批量操作 nonce 消耗:
   * - transfer: 1
   * - createEscrow: 1
   * - releaseEscrow: 1
   * - publishTask: 1
   * - bid: 1
   * - acceptBid: 5 (accept + order + escrow + fund + update)
   * - completeTask: 2-4 (deliver + review + release...)
   */
  async nextBatch(did: string, count: number): Promise<number> {
    await this.acquireLock(did);
    try {
      if (!this.counters.has(did)) {
        await this.sync(did);
      }
      const current = this.counters.get(did) ?? 0;
      const start = current + 1;
      this.counters.set(did, current + count);
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
      // 嵌入式模式：直读 EventStore（最快、最准确）
      committedNonce = await this.eventStore.getCommittedNonce(did);
    } else if (this.clawnetClient) {
      // 外部模式：通过 wallet.getNonce() API
      const result = await this.clawnetClient.wallet.getNonce({ did });
      committedNonce = result.nonce;
    }

    this.counters.set(did, committedNonce);
  }

  /**
   * 处理 nonce 冲突：重新同步
   */
  async handleNonceConflict(did: string): Promise<void> {
    await this.sync(did);
  }

  // ── 串行化锁 ──────────────────────────────────────────

  private async acquireLock(did: string): Promise<void> {
    while (this.locks.has(did)) {
      await this.locks.get(did);
    }
    let resolve!: () => void;
    this.locks.set(did, new Promise<void>((r) => { resolve = r; }));
    (this.locks.get(did) as any).__resolve = resolve;
  }

  private releaseLock(did: string): void {
    const lock = this.locks.get(did) as any;
    this.locks.delete(did);
    if (lock?.__resolve) lock.__resolve();
  }
}
```

---

### Step 3.3 — Session API 路由预告

Session 相关的 3 个端点将在 Phase 5 Step 5.2 的 `packages/node/src/api/routes/clawnet.ts` 中统一创建。

**路由签名预览**:
```
POST /api/v1/session/unlock    →  { passphrase, ttlSeconds?, scope? }  →  { sessionToken, expiresAt, scope, did }
POST /api/v1/session/lock      →  Authorization: Bearer tses_xxx       →  204 No Content
GET  /api/v1/session            →  Authorization: Bearer tses_xxx       →  { active, expiresAt, scope, operationsUsed, createdAt }
```


---

## Phase 4 — ClawNetGatewayService + Identity 迁移

### Step 4.1 — 创建 ClawNetGatewayService

**目标**: 封装 ClawNet SDK 调用，集成 Session + Nonce 管理，成为 TelAgent 访问 ClawNet 业务的唯一入口。

#### 创建 `packages/node/src/clawnet/gateway-service.ts`

```typescript
// ============================================================
// ClawNetGatewayService
// ============================================================
// 职责：
//   1. 封装 @claw-network/sdk 的 ClawNetClient
//   2. 所有写操作通过 SessionManager 注入 passphrase
//   3. 所有写操作通过 NonceManager 自动管理 nonce
//   4. nonce 冲突自动重试（最多 3 次）
//   5. 只读操作直接透传，不需要 session
// ============================================================

import { ClawNetClient } from '@claw-network/sdk';
import type { SessionManager, OperationScope } from './session-manager.js';
import type { NonceManager } from './nonce-manager.js';

export interface ClawNetGatewayConfig {
  baseUrl: string;                // ClawNet Node REST API 地址
  apiKey?: string;                // 可选 API Key
  timeoutMs?: number;             // 请求超时（默认 30000）
}

// ── 类型定义（根据 ClawNet SDK 实际类型调整） ──

export interface IdentityInfo {
  did: string;
  address: string;
  isActive: boolean;
  controller: string;
  activeKey: string;
  document?: Record<string, unknown>;
}

export interface BalanceInfo {
  native: string;       // Wei
  token: string;        // CLAW token
  did: string;
  address: string;
}

export interface TransferResult {
  txHash: string;
  nonce: number;
}

export interface EscrowInfo {
  id: string;
  creator: string;
  beneficiary: string;
  amount: number;
  status: string;
}

export interface TaskInfo {
  id: string;
  title: string;
  status: string;
  owner: string;
}

export interface BidInfo {
  id: string;
  bidder: string;
  amount: number;
  status: string;
}

export interface ReputationInfo {
  did: string;
  score: number;
  reviewCount: number;
}

export class ClawNetGatewayService {
  public readonly client: ClawNetClient;

  constructor(
    private readonly config: ClawNetGatewayConfig,
    private readonly sessionManager: SessionManager,
    private readonly nonceManager: NonceManager,
  ) {
    this.client = new ClawNetClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? 30_000,
    });
  }

  // ── 只读操作（不需要 session） ──────────────────────

  /** 获取本节点 Identity */
  async getSelfIdentity(): Promise<IdentityInfo> {
    const result = await this.client.identity.get();
    return result as unknown as IdentityInfo;
  }

  /** 解析任意 DID */
  async resolveIdentity(did: string): Promise<IdentityInfo> {
    const result = await this.client.identity.resolve(did);
    return result as unknown as IdentityInfo;
  }

  /** 查询余额 */
  async getBalance(did?: string): Promise<BalanceInfo> {
    const result = await this.client.wallet.getBalance(did ? { did } : undefined);
    return result as unknown as BalanceInfo;
  }

  /** 查询 Nonce */
  async getNonce(did?: string): Promise<{ nonce: number; address: string }> {
    return this.client.wallet.getNonce(did ? { did } : undefined);
  }

  /** 查询 Escrow 详情 */
  async getEscrow(escrowId: string): Promise<EscrowInfo> {
    const result = await this.client.wallet.getEscrow(escrowId);
    return result as unknown as EscrowInfo;
  }

  /** 查询任务列表 */
  async listTasks(filters?: Record<string, unknown>): Promise<TaskInfo[]> {
    const result = await this.client.markets.tasks.list(filters);
    return result as unknown as TaskInfo[];
  }

  /** 查询某任务的竞标 */
  async listBids(taskId: string): Promise<BidInfo[]> {
    const result = await this.client.markets.tasks.listBids(taskId);
    return result as unknown as BidInfo[];
  }

  /** 查询 DID 的信誉 */
  async getReputation(did: string): Promise<ReputationInfo> {
    const result = await this.client.reputation.get(did);
    return result as unknown as ReputationInfo;
  }

  /** 健康检查 */
  async healthCheck(): Promise<{ healthy: boolean; did?: string }> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/api/v1/node`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return { healthy: false };
      const body = await resp.json() as { data?: { did?: string } };
      return { healthy: true, did: body?.data?.did };
    } catch {
      return { healthy: false };
    }
  }

  /** 获取 Agent Profile（Identity + Reputation 合并）— RFC §4.3 GET /profile/{did} */
  async getAgentProfile(did: string): Promise<{ identity: IdentityInfo; reputation: ReputationInfo | null }> {
    const [identity, reputation] = await Promise.all([
      this.resolveIdentity(did),
      this.getReputation(did).catch(() => null),
    ]);
    return { identity, reputation };
  }

  /** 查询交易历史 — RFC §4.3 GET /wallet/history */
  async getWalletHistory(did?: string, params?: { limit?: number; offset?: number }): Promise<unknown[]> {
    const result = await this.client.wallet.getHistory(did ? { did, ...params } : params);
    return result as unknown as unknown[];
  }

  /** 搜索市场 — RFC §4.3 GET /markets/search */
  async searchMarkets(params?: { q?: string; type?: string }): Promise<unknown[]> {
    const result = await this.client.markets.search(params);
    return result as unknown as unknown[];
  }

  /** 创建服务合同 — RFC §4.3 POST /contracts */
  async createServiceContract(
    sessionToken: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return this.executeWithNonceRetry(sessionToken, 'contract', 1,
      (did, passphrase, nonce) =>
        this.client.contracts.create({
          did, passphrase, nonce,
          ...params,
        }),
    );
  }

  // ── 写操作（需要 session + nonce） ─────────────────

  /** 转账 */
  async transfer(
    sessionToken: string,
    params: { to: string; amount: number; memo?: string },
  ): Promise<TransferResult> {
    return this.executeWithNonceRetry(sessionToken, 'transfer', 1,
      (did, passphrase, nonce) =>
        this.client.wallet.transfer({
          did, passphrase, nonce,
          to: params.to,
          amount: params.amount,
          memo: params.memo,
        }),
    );
  }

  /** 创建 Escrow */
  async createEscrow(
    sessionToken: string,
    params: { beneficiary: string; amount: number; releaseRules?: unknown[] },
  ): Promise<EscrowInfo> {
    return this.executeWithNonceRetry(sessionToken, 'escrow', 1,
      (did, passphrase, nonce) =>
        this.client.wallet.createEscrow({
          did, passphrase, nonce,
          ...params,
        }),
    );
  }

  /** 释放 Escrow */
  async releaseEscrow(
    sessionToken: string,
    params: { escrowId: string },
  ): Promise<unknown> {
    return this.executeWithNonceRetry(sessionToken, 'escrow', 1,
      (did, passphrase, nonce) =>
        this.client.wallet.releaseEscrow({
          did, passphrase, nonce,
          escrowId: params.escrowId,
        }),
    );
  }

  /** 发布任务 */
  async publishTask(
    sessionToken: string,
    params: { title: string; description: string; budget: number; tags?: string[] },
  ): Promise<TaskInfo> {
    return this.executeWithNonceRetry(sessionToken, 'market', 1,
      (did, passphrase, nonce) =>
        this.client.markets.tasks.publish({
          did, passphrase, nonce,
          ...params,
        }),
    );
  }

  /** 竞标 */
  async bid(
    sessionToken: string,
    params: { taskId: string; amount: number; proposal?: string },
  ): Promise<BidInfo> {
    return this.executeWithNonceRetry(sessionToken, 'market', 1,
      (did, passphrase, nonce) =>
        this.client.markets.tasks.bid(params.taskId, {
          did, passphrase, nonce,
          amount: params.amount,
          proposal: params.proposal,
        }),
    );
  }

  /** 接受竞标（消耗 5 个 nonce） */
  async acceptBid(
    sessionToken: string,
    params: { taskId: string; bidId: string },
  ): Promise<unknown> {
    return this.executeWithNonceRetry(sessionToken, 'market', 5,
      (did, passphrase, nonce) =>
        this.client.markets.tasks.acceptBid(params.taskId, {
          did, passphrase, nonce,
          bidId: params.bidId,
        }),
    );
  }

  /** 提交评价 */
  async submitReview(
    sessionToken: string,
    params: { targetDid: string; score: number; comment?: string; orderId?: string },
  ): Promise<unknown> {
    return this.executeWithNonceRetry(sessionToken, 'reputation', 1,
      (did, passphrase, nonce) =>
        this.client.reputation.submit({
          did, passphrase, nonce,
          ...params,
        }),
    );
  }

  // ── Nonce 冲突自动重试 ─────────────────────────────

  private async executeWithNonceRetry<T>(
    sessionToken: string,
    scope: OperationScope,
    nonceCount: number,
    operation: (did: string, passphrase: string, nonce: number) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    const { did, passphrase } = this.sessionManager.resolvePassphrase(sessionToken, scope);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const nonce = nonceCount === 1
        ? await this.nonceManager.next(did)
        : await this.nonceManager.nextBatch(did, nonceCount);

      try {
        return await operation(did, passphrase, nonce);
      } catch (error) {
        if (this.isNonceConflict(error) && attempt < maxRetries - 1) {
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
}
```

**设计要点**:
- 只读操作（`getSelfIdentity`, `resolveIdentity`, `getBalance` 等）不需要 session token
- 所有写操作接受 `sessionToken` 而非 `passphrase`
- `executeWithNonceRetry` 统一处理 session 解析 + nonce 分配 + 冲突重试
- `nonceCount` 参数支持多 nonce 操作（如 `acceptBid` = 5）

---

### Step 4.2 — 迁移 IdentityAdapterService

**目标**: 将 `IdentityAdapterService` 从直连合约改为委托 `ClawNetGatewayService`。

#### 重写 `packages/node/src/services/identity-adapter-service.ts`

```typescript
import type { ClawNetGatewayService, IdentityInfo } from '../clawnet/gateway-service.js';

export interface ResolvedIdentity {
  did: string;
  address: string;
  isActive: boolean;
  controller: string;
  activeKey: string;
}

export class IdentityAdapterService {
  private selfDidCache: string | null = null;

  constructor(
    private readonly gateway: ClawNetGatewayService,
  ) {}

  /**
   * 获取本节点 DID（缓存结果，仅第一次调用走网络）
   * 替代原先的 config.selfDid 配置项
   */
  async getSelf(): Promise<ResolvedIdentity> {
    const info = await this.gateway.getSelfIdentity();
    this.selfDidCache = info.did;
    return this.toResolvedIdentity(info);
  }

  /**
   * 获取缓存的 self DID（同步访问）
   */
  getSelfDid(): string {
    if (!this.selfDidCache) {
      throw new Error('Identity not initialized. Call getSelf() first.');
    }
    return this.selfDidCache;
  }

  /**
   * 初始化 self DID 缓存（启动时调用）
   */
  async init(): Promise<void> {
    await this.getSelf();
  }

  /**
   * 解析任意 DID
   * 替代原先直连 ClawIdentity 合约的 3 个 view 调用
   */
  async resolve(did: string): Promise<ResolvedIdentity> {
    const info = await this.gateway.resolveIdentity(did);
    return this.toResolvedIdentity(info);
  }

  /**
   * 断言 DID 处于活跃状态
   */
  async assertActiveDid(did: string): Promise<void> {
    const resolved = await this.resolve(did);
    if (!resolved.isActive) {
      throw new Error(`DID ${did} is not active`);
    }
  }

  private toResolvedIdentity(info: IdentityInfo): ResolvedIdentity {
    return {
      did: info.did,
      address: info.address,
      isActive: info.isActive,
      controller: info.controller,
      activeKey: info.activeKey,
    };
  }
}
```

**变更清单**:
1. 构造函数参数：`ContractProvider` → `ClawNetGatewayService`
2. `getSelf()`: `config.selfDid` + 合约 → `gateway.getSelfIdentity()`
3. `resolve(did)`: 合约 3 个 view → `gateway.resolveIdentity(did)`
4. 新增 `getSelfDid()`: 缓存访问器（替代 `config.selfDid`）
5. 新增 `init()`: 启动时预热缓存
6. 删除所有 `this.contracts` 引用

---

### Step 4.3 — 清理 ContractProvider

**目标**: 从 `ContractProvider` 中删除 `identity`、`token`、`router` 合约实例。

#### 修改 `packages/node/src/services/contract-provider.ts`

**删除**:
1. `identity` 属性
2. `token` 属性
3. `router` 属性
4. 构造函数中创建这些合约实例的代码
5. 相关 ABI import

**保留**:
- `telagentGroupRegistry` 合约实例（TelAgent 自有合约）
- `provider` 和 `signer`（群组操作上链仍需要）

完整重写代码已在 Step 0.2.2 中给出。

---

### Step 4.4 — 迁移 wallets 路由

**目标**: 修改 `/api/v1/wallets/:did/gas-balance` 路由。

#### 修改 `packages/node/src/api/routes/wallets.ts`

```typescript
import type { RuntimeContext } from '../types.js';
import { Router } from 'express';

export function walletsRoutes(ctx: RuntimeContext): Router {
  const router = Router();

  router.get('/:did/gas-balance', async (req, res) => {
    try {
      const { did } = req.params;

      // 使用 ClawNetGatewayService 查询余额（替代 3 次合约调用）
      const balance = await ctx.clawnetGateway.getBalance(did);

      res.json({
        data: {
          did: balance.did,
          address: balance.address,
          nativeBalance: balance.native,
          tokenBalance: balance.token,
        },
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
```

---

### Step 4.5 — 增强 identities 路由

`packages/node/src/api/routes/identities.ts` 底层的 `ctx.identityService` 已被 Step 4.2 重写为委托 `ClawNetGatewayService`。

**新增变更**（RFC §4.1.1："返回更丰富的 Identity 信息，含 capabilities"）：

在 `/self` 和 `/:did` 路由的响应中，原先仅返回 6 个字段的 `IdentityView`，现在应返回 ClawNet 完整 Identity 对象。具体修改 `identities.ts` 中两个路由的序列化逻辑：

```typescript
// 示例：GET /api/v1/identities/self
router.get('/self', async (_req, res) => {
  try {
    const identity = await ctx.identityService.getSelf();
    // 额外查询 capabilities（RFC §4.1.1 明确要求）
    const fullIdentity = await ctx.clawnetGateway.resolveIdentity(identity.did);
    res.json({
      data: {
        ...identity,
        capabilities: fullIdentity.document?.capabilities ?? [],
        keyHistory: fullIdentity.document?.keyHistory ?? [],
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 示例：GET /api/v1/identities/:did
router.get('/:did', async (req, res) => {
  try {
    const identity = await ctx.identityService.resolve(req.params.did);
    const fullIdentity = await ctx.clawnetGateway.resolveIdentity(req.params.did);
    res.json({
      data: {
        ...identity,
        capabilities: fullIdentity.document?.capabilities ?? [],
        keyHistory: fullIdentity.document?.keyHistory ?? [],
      },
    });
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});
```

**验证**: `pnpm --filter @telagent/node typecheck` 通过。


---

## Phase 5 — ContentType 扩展 + ClawNet 代理 API 路由

### Step 5.1 — 扩展 ContentType 类型

**目标**: 在 `@telagent/protocol` 中扩展 `ContentType`，增加 `telagent/*` 命名空间。

#### 修改 `packages/protocol/src/types.ts`

**当前定义**:
```typescript
export type ContentType = 'text' | 'image' | 'file' | 'control';
```

**扩展为**:
```typescript
// ── 基础消息类型 ──────────────────────────────────
export type BaseContentType = 'text' | 'image' | 'file' | 'control';

// ── TelAgent 扩展消息类型（telagent/* 命名空间，与 RFC §4.2 对齐） ──
export type TelagentContentType =
  | 'telagent/identity-card'       // 展示 Identity + Reputation 卡片
  | 'telagent/transfer-request'    // 转账请求
  | 'telagent/transfer-receipt'    // 转账完成回执
  | 'telagent/task-listing'        // 任务发布卡片
  | 'telagent/task-bid'            // 竞标通知
  | 'telagent/escrow-created'      // 托管创建通知
  | 'telagent/escrow-released'     // 托管释放通知
  | 'telagent/milestone-update'    // 里程碑进度更新
  | 'telagent/review-card';        // 评价卡片

// ── 联合类型 ──────────────────────────────────────
export type ContentType = BaseContentType | TelagentContentType;
```

#### 创建 `packages/protocol/src/content-schemas.ts`

```typescript
// ============================================================
// TelagentContentType Payload Schemas
// ============================================================
// 每种 telagent/* 类型对应的 payload 结构定义。
// ============================================================

/** telagent/identity-card — 与 RFC §4.2 payload 示例对齐 */
export interface IdentityCardPayload {
  did: string;
  publicKey: string;               // 公钥
  reputation: {                    // 嵌套信誉信息
    score: number;
    reviews: number;
  };
  capabilities: string[];          // 能力列表
}

/** telagent/transfer-request */
export interface TransferRequestPayload {
  fromDid: string;         // 发送方 DID
  toDid: string;           // 目标 DID
  amount: number;          // CLAW 代币数量
  currency: string;        // 'CLAW'
  memo?: string;
  requestId: string;       // 防重放
}

/** telagent/transfer-receipt */
export interface TransferReceiptPayload {
  txHash: string;
  fromDid: string;         // 发送方 DID
  toDid: string;           // 接收方 DID
  amount: number;
  status: string;          // 'confirmed' 等
  timestamp: number;       // Unix ms
}

/** telagent/task-listing — RFC 中为 task-listing（非 task-card） */
export interface TaskListingPayload {
  listingId: string;
  title: string;
  pricing: {
    model: string;         // 'fixed' | 'hourly' 等
    basePrice: number;
  };
  deadline?: number;       // Unix ms
  tags?: string[];
}

/** telagent/task-bid */
export interface TaskBidPayload {
  listingId: string;
  bidder: string;          // DID
  amount: number;
  proposal?: string;
}

/** telagent/escrow-created */
export interface EscrowCreatedPayload {
  escrowId: string;
  creator: string;         // DID
  beneficiary: string;     // DID
  amount: number;
  status: 'created';
  txHash?: string;
}

/** telagent/escrow-released */
export interface EscrowReleasedPayload {
  escrowId: string;
  beneficiary: string;     // DID
  amount: number;
  status: 'released';
  txHash?: string;
}

/** telagent/milestone-update */
export interface MilestoneUpdatePayload {
  contractId: string;
  milestoneIndex: number;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'disputed';
  updatedAt: string;       // ISO 8601
}

/** telagent/review-card — 与 RFC §4.2 payload 示例对齐 */
export interface ReviewCardPayload {
  targetDid: string;
  rating: number;          // 1-5
  comment: string;
  txHash: string;
}

/** 所有 payload 的联合类型 */
export type TelagentPayload =
  | IdentityCardPayload
  | TransferRequestPayload
  | TransferReceiptPayload
  | TaskListingPayload
  | TaskBidPayload
  | EscrowCreatedPayload
  | EscrowReleasedPayload
  | MilestoneUpdatePayload
  | ReviewCardPayload;
```

#### 更新 `packages/protocol/src/index.ts` 导出

添加：
```typescript
export * from './content-schemas.js';
```

---

### Step 5.2 — 创建 ClawNet 代理 API 路由

**目标**: 实现 Session 管理路由 + ClawNet 业务代理路由。

#### 创建 `packages/node/src/api/routes/session.ts`

```typescript
import { Router } from 'express';
import type { RuntimeContext } from '../types.js';

export function sessionRoutes(ctx: RuntimeContext): Router {
  const router = Router();

  /**
   * POST /unlock
   * Body: { passphrase, ttlSeconds?, scope?, maxOperations? }
   * Response: { data: { sessionToken, expiresAt, scope, did } }
   */
  router.post('/unlock', async (req, res) => {
    try {
      const { passphrase, ttlSeconds, scope, maxOperations } = req.body;
      if (!passphrase || typeof passphrase !== 'string') {
        return res.status(400).json({ error: 'passphrase is required' });
      }

      const selfDid = ctx.identityService.getSelfDid();
      const result = await ctx.sessionManager.unlock({
        passphrase,
        did: selfDid,
        ttlSeconds,
        scope,
        maxOperations,
        validatePassphrase: async (_did, pass) => {
          try {
            await ctx.clawnetGateway.getNonce();
            return true;
          } catch {
            return false;
          }
        },
      });

      res.json({
        data: {
          sessionToken: result.sessionToken,
          expiresAt: result.expiresAt.toISOString(),
          scope: result.scope,
          did: selfDid,
        },
      });
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Too many') ? 429 : msg.includes('Invalid') ? 401 : 500;
      res.status(status).json({ error: msg });
    }
  });

  /**
   * POST /lock
   * Header: Authorization: Bearer tses_xxx
   */
  router.post('/lock', (req, res) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ error: 'Missing Authorization header' });
      ctx.sessionManager.lock(token);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * GET /
   * Header: Authorization: Bearer tses_xxx
   */
  router.get('/', (req, res) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

      const info = ctx.sessionManager.getSessionInfo(token);
      if (!info) return res.status(404).json({ error: 'Session not found or expired' });

      res.json({
        data: {
          active: info.active,
          expiresAt: info.expiresAt.toISOString(),
          scope: info.scope,
          operationsUsed: info.operationsUsed,
          createdAt: info.createdAt.toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}

function extractBearerToken(req: { headers: Record<string, string | undefined> }): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}
```

#### 创建 `packages/node/src/api/routes/clawnet.ts`

```typescript
import { Router } from 'express';
import type { RuntimeContext } from '../types.js';

export function clawnetRoutes(ctx: RuntimeContext): Router {
  const router = Router();

  // ── 只读路由 ──────────────────────────────────────

  router.get('/wallet/balance/:did?', async (req, res) => {
    try {
      const balance = await ctx.clawnetGateway.getBalance(req.params.did);
      res.json({ data: balance });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/wallet/nonce/:did?', async (req, res) => {
    try {
      const result = await ctx.clawnetGateway.getNonce(req.params.did);
      res.json({ data: result });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/identity/self', async (_req, res) => {
    try {
      const identity = await ctx.clawnetGateway.getSelfIdentity();
      res.json({ data: identity });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/identity/:did', async (req, res) => {
    try {
      const identity = await ctx.clawnetGateway.resolveIdentity(req.params.did);
      res.json({ data: identity });
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  router.get('/escrow/:id', async (req, res) => {
    try {
      const escrow = await ctx.clawnetGateway.getEscrow(req.params.id);
      res.json({ data: escrow });
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  /** RFC §4.3: GET /profile/{did} — Agent Identity + Reputation 合并 */
  router.get('/profile/:did', async (req, res) => {
    try {
      const profile = await ctx.clawnetGateway.getAgentProfile(req.params.did);
      res.json({ data: profile });
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  /** RFC §4.3: GET /wallet/history — 交易历史 */
  router.get('/wallet/history/:did?', async (req, res) => {
    try {
      const { limit, offset } = req.query as { limit?: string; offset?: string };
      const history = await ctx.clawnetGateway.getWalletHistory(
        req.params.did,
        { limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined },
      );
      res.json({ data: history });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** RFC §4.3: GET /markets/search — 跨市场搜索 */
  router.get('/markets/search', async (req, res) => {
    try {
      const { q, type } = req.query as { q?: string; type?: string };
      const results = await ctx.clawnetGateway.searchMarkets({ q, type });
      res.json({ data: results });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/market/tasks', async (req, res) => {
    try {
      const tasks = await ctx.clawnetGateway.listTasks(req.query as Record<string, unknown>);
      res.json({ data: tasks });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/market/tasks/:taskId/bids', async (req, res) => {
    try {
      const bids = await ctx.clawnetGateway.listBids(req.params.taskId);
      res.json({ data: bids });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/reputation/:did', async (req, res) => {
    try {
      const rep = await ctx.clawnetGateway.getReputation(req.params.did);
      res.json({ data: rep });
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  router.get('/health', async (_req, res) => {
    try {
      const health = await ctx.clawnetGateway.healthCheck();
      res.json({ data: health });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ── 写操作路由（需要 session） ─────────────────────

  router.post('/wallet/transfer', async (req, res) => {
    try {
      const token = requireSessionToken(req);
      const { to, amount, memo } = req.body;
      const result = await ctx.clawnetGateway.transfer(token, { to, amount, memo });
      res.json({ data: result });
    } catch (error) {
      handleWriteError(res, error);
    }
  });

  router.post('/wallet/escrow', async (req, res) => {
    try {
      const token = requireSessionToken(req);
      const { beneficiary, amount, releaseRules } = req.body;
      const result = await ctx.clawnetGateway.createEscrow(token, { beneficiary, amount, releaseRules });
      res.json({ data: result });
    } catch (error) {
      handleWriteError(res, error);
    }
  });

  router.post('/wallet/escrow/:id/release', async (req, res) => {
    try {
      const token = requireSessionToken(req);
      const result = await ctx.clawnetGateway.releaseEscrow(token, { escrowId: req.params.id });
      res.json({ data: result });
    } catch (error) {
      handleWriteError(res, error);
    }
  });

  router.post('/market/tasks', async (req, res) => {
    try {
      const token = requireSessionToken(req);
      const { title, description, budget, tags } = req.body;
      const result = await ctx.clawnetGateway.publishTask(token, { title, description, budget, tags });
      res.json({ data: result });
    } catch (error) {
      handleWriteError(res, error);
    }
  });

  router.post('/market/tasks/:taskId/bid', async (req, res) => {
    try {
      const token = requireSessionToken(req);
      const { amount, proposal } = req.body;
      const result = await ctx.clawnetGateway.bid(token, {
        taskId: req.params.taskId,
        amount,
        proposal,
      });
      res.json({ data: result });
    } catch (error) {
      handleWriteError(res, error);
    }
  });

  router.post('/market/tasks/:taskId/accept-bid', async (req, res) => {
    try {
      const token = requireSessionToken(req);
      const { bidId } = req.body;
      const result = await ctx.clawnetGateway.acceptBid(token, {
        taskId: req.params.taskId,
        bidId,
      });
      res.json({ data: result });
    } catch (error) {
      handleWriteError(res, error);
    }
  });

  router.post('/reputation/review', async (req, res) => {
    try {
      const token = requireSessionToken(req);
      const { targetDid, score, comment, orderId } = req.body;
      const result = await ctx.clawnetGateway.submitReview(token, {
        targetDid, score, comment, orderId,
      });
      res.json({ data: result });
    } catch (error) {
      handleWriteError(res, error);
    }
  });

  /** RFC §4.3: POST /contracts — 创建服务合同 */
  router.post('/contracts', async (req, res) => {
    try {
      const token = requireSessionToken(req);
      const result = await ctx.clawnetGateway.createServiceContract(token, req.body);
      res.json({ data: result });
    } catch (error) {
      handleWriteError(res, error);
    }
  });

  return router;
}

function requireSessionToken(req: { headers: Record<string, string | undefined> }): string {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    throw Object.assign(
      new Error('Missing or invalid Authorization header. Use: Bearer tses_xxx'),
      { statusCode: 401 },
    );
  }
  const token = auth.slice(7);
  if (!token.startsWith('tses_')) {
    throw Object.assign(new Error('Invalid session token format'), { statusCode: 401 });
  }
  return token;
}

function handleWriteError(res: any, error: unknown): void {
  const err = error as Error & { statusCode?: number };
  const msg = err.message;
  let status = err.statusCode ?? 500;
  if (msg.includes('Invalid or expired session') || msg.includes('Missing')) status = 401;
  else if (msg.includes('scope')) status = 403;
  else if (msg.includes('Too many') || msg.includes('operation limit')) status = 429;
  res.status(status).json({ error: msg });
}
```

---

### Step 5.3 — 注册新路由到 Router

**目标**: 在 `packages/node/src/api/router.ts` 中挂载 session 和 clawnet 路由。

#### 修改 `packages/node/src/api/router.ts`

添加 import:
```typescript
import { sessionRoutes } from './routes/session.js';
import { clawnetRoutes } from './routes/clawnet.js';
```

在现有路由注册之后添加：
```typescript
app.use('/api/v1/session', sessionRoutes(ctx));
app.use('/api/v1/clawnet', clawnetRoutes(ctx));
```

**完整路由表**:
```
已有:
  /api/v1/identities/*     → identitiesRoutes(ctx)
  /api/v1/wallets/*        → walletsRoutes(ctx)
  /api/v1/groups/*         → groupsRoutes(ctx)
  /api/v1/messages/*       → messagesRoutes(ctx)

新增:
  /api/v1/session/*        → sessionRoutes(ctx)
  /api/v1/clawnet/*        → clawnetRoutes(ctx)
```


---

## Phase 6 — app.ts 核心重构 + RuntimeContext 更新

### Step 6.1 — 更新 RuntimeContext 类型

**目标**: 向 `RuntimeContext` 添加 ClawNet 集成所需的新服务。

#### 修改 `packages/node/src/api/types.ts`

**当前**（8 个服务）:
```typescript
export interface RuntimeContext {
  identityService: IdentityAdapterService;
  groupService: GroupService;
  gasService: GasService;
  messageService: MessageService;
  attachmentService: AttachmentService;
  federationService: FederationService;
  monitoringService: MonitoringService;
  keyLifecycleService: KeyLifecycleService;
}
```

**扩展为**（新增 3 个）:
```typescript
import type { ClawNetGatewayService } from '../clawnet/gateway-service.js';
import type { SessionManager } from '../clawnet/session-manager.js';
import type { NonceManager } from '../clawnet/nonce-manager.js';

export interface RuntimeContext {
  // ── 已有服务 ──
  identityService: IdentityAdapterService;
  groupService: GroupService;
  gasService: GasService;
  messageService: MessageService;
  attachmentService: AttachmentService;
  federationService: FederationService;
  monitoringService: MonitoringService;
  keyLifecycleService: KeyLifecycleService;

  // ── ClawNet 集成（新增） ──
  clawnetGateway: ClawNetGatewayService;
  sessionManager: SessionManager;
  nonceManager: NonceManager;
}
```

---

### Step 6.2 — 创建 ClawNet barrel 导出

#### 创建 `packages/node/src/clawnet/index.ts`

```typescript
export { discoverOrStartClawNet, probeNodeHealth } from './discovery.js';
export type { ClawNetDiscoveryResult } from './discovery.js';

export { ManagedClawNetNode } from './managed-node.js';

export { verifyPassphrase } from './verify-passphrase.js';

export { SessionManager } from './session-manager.js';
export type { OperationScope, UnlockParams, UnlockResult, ResolveResult, SessionInfo } from './session-manager.js';

export { NonceManager } from './nonce-manager.js';

export { ClawNetGatewayService } from './gateway-service.js';
export type { ClawNetGatewayConfig, IdentityInfo, BalanceInfo } from './gateway-service.js';
```

---

### Step 6.3 — 重构 TelagentNode 类

**目标**: 重写 `packages/node/src/app.ts` 的 `start()` 和 `stop()` 方法。

**新的完整启动序列**:

```
start() 执行顺序:
  1. resolveTelagentPaths(TELAGENT_HOME)
  2. ensureTelagentDirs(paths)
  3. verifySecretsPermissions(paths)
  4. resolvePassphrase(paths)      → 从 env / file 获取 passphrase
  5. discoverOrStartClawNet(...)    → 查找或启动 ClawNet Node
  6. verifyPassphrase(nodeUrl, passphrase)  → 验证密码匹配
  7. savePassphrase(paths, passphrase)      → 持久化（如首次）
  8. waitForSync(clawnetGateway)    → 等待 ClawNet Node 同步完成（RFC §4.1.1 步骤 2）
  9. new SessionManager()
  10. new NonceManager(eventStore, client)
  11. new ClawNetGatewayService(config, session, nonce)
  12. new IdentityAdapterService(gateway) + init()
  13. sessionManager.unlock(auto-session, 24h TTL)
  14. setInterval(23h, renew-session)
  15. new ContractProvider(chain)    → 仅 TelagentGroupRegistry
  16. new GasService(contracts)
  17. 创建其余服务（group, message, attachment, federation...）
  18. 组装 RuntimeContext（含 3 个新服务）
  19. new ApiServer(ctx, routes)     → 含 session + clawnet 路由
  20. 启动 mailbox, indexer, API server

stop() 执行顺序:
  1. clearInterval(renewTimer)
  2. sessionManager.lockAll()       → 擦除所有 passphrase
  3. 停止 API server
  4. 停止 mailbox, indexer 等
  5. managedClawNet?.stop()         → 停止自管 ClawNet Node（最后！）
```

#### 重写 `packages/node/src/app.ts`

```typescript
import { resolveTelagentPaths, ensureTelagentDirs, verifySecretsPermissions } from './storage/telagent-paths.js';
import { resolvePassphrase as resolvePassphraseFromSources } from './storage/passphrase-resolver.js';
import { savePassphrase } from './storage/passphrase-store.js';
import { discoverOrStartClawNet } from './clawnet/discovery.js';
import { verifyPassphrase } from './clawnet/verify-passphrase.js';
import { SessionManager } from './clawnet/session-manager.js';
import { NonceManager } from './clawnet/nonce-manager.js';
import { ClawNetGatewayService } from './clawnet/gateway-service.js';
import { IdentityAdapterService } from './services/identity-adapter-service.js';
import { ContractProvider } from './services/contract-provider.js';
import { GasService } from './services/gas-service.js';
import type { TelagentStoragePaths } from './storage/telagent-paths.js';
import type { ClawNetDiscoveryResult } from './clawnet/discovery.js';
import type { RuntimeContext } from './api/types.js';
import type { AppConfig } from './config.js';

const logger = console;

const SESSION_RENEW_MS = 23 * 60 * 60 * 1000;   // 23 小时
const SESSION_TTL_SECONDS = 24 * 60 * 60;        // 24 小时

export class TelagentNode {
  private paths!: TelagentStoragePaths;
  private managedClawNet?: any;
  private sessionManager!: SessionManager;
  private nonceManager!: NonceManager;
  private clawnetGateway!: ClawNetGatewayService;
  private identityService!: IdentityAdapterService;
  private autoSessionToken?: string;
  private renewTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly config: AppConfig) {}

  async start(): Promise<void> {
    // 1. 路径解析 + 目录初始化
    this.paths = resolveTelagentPaths(this.config.paths.root);
    await ensureTelagentDirs(this.paths);
    await verifySecretsPermissions(this.paths);
    logger.info('[telagent] TELAGENT_HOME: %s', this.paths.root);

    // 2. Passphrase 解析
    const passphrase = await resolvePassphraseFromSources(this.paths);

    // 3. ClawNet 发现 / 自动启动
    const discovery: ClawNetDiscoveryResult = await discoverOrStartClawNet(
      this.config.clawnet.nodeUrl,
      passphrase ?? undefined,
      {
        autoStart: this.config.clawnet.autoStart,
        autoDiscover: this.config.clawnet.autoDiscover,
      },
    );
    this.managedClawNet = discovery.managedNode;
    logger.info('[telagent] ClawNet: %s → %s', discovery.source, discovery.nodeUrl);

    // 4. Passphrase 验证
    if (passphrase && discovery.nodeUrl) {
      const check = await verifyPassphrase(discovery.nodeUrl, passphrase);
      if (!check.valid) {
        if (this.managedClawNet) await this.managedClawNet.stop();
        throw new Error(
          `[telagent] FATAL: Passphrase verification failed — ${check.error}. ` +
          'Ensure TELAGENT_CLAWNET_PASSPHRASE matches the ClawNet Node keystore.',
        );
      }
      if (check.error) logger.warn('[telagent] %s', check.error);
      logger.info('[telagent] Passphrase verified — DID: %s', check.did);
      await savePassphrase(this.paths, passphrase);
    }

    // 5. 创建 ClawNet 服务层
    this.sessionManager = new SessionManager();
    this.nonceManager = new NonceManager(
      discovery.managedNode?.getEventStore?.(),
    );
    this.clawnetGateway = new ClawNetGatewayService(
      {
        baseUrl: discovery.nodeUrl!,
        apiKey: this.config.clawnet.apiKey,
        timeoutMs: this.config.clawnet.timeoutMs,
      },
      this.sessionManager,
      this.nonceManager,
    );

    // 5.5 等待 ClawNet Node 同步完成（RFC §4.1.1 步骤 2）
    logger.info('[telagent] Waiting for ClawNet Node to sync...');
    await this.clawnetGateway.client.node.waitForSync();
    logger.info('[telagent] ClawNet Node synced');

    // 6. Identity 初始化
    this.identityService = new IdentityAdapterService(this.clawnetGateway);
    await this.identityService.init();
    logger.info('[telagent] Identity: %s', this.identityService.getSelfDid());

    // 7. 自动 Session（Agent 自主运行模式）
    if (passphrase) {
      const selfDid = this.identityService.getSelfDid();
      const result = await this.sessionManager.unlock({
        passphrase,
        did: selfDid,
        ttlSeconds: SESSION_TTL_SECONDS,
        validatePassphrase: async () => true,
      });
      this.autoSessionToken = result.sessionToken;
      logger.info('[telagent] Auto-session expires: %s', result.expiresAt.toISOString());

      this.renewTimer = setInterval(async () => {
        try {
          const old = this.autoSessionToken;
          const renew = await this.sessionManager.unlock({
            passphrase,
            did: selfDid,
            ttlSeconds: SESSION_TTL_SECONDS,
            validatePassphrase: async () => true,
          });
          this.autoSessionToken = renew.sessionToken;
          if (old) this.sessionManager.lock(old);
          logger.info('[telagent] Auto-session renewed — expires: %s', renew.expiresAt.toISOString());
        } catch (err) {
          logger.error('[telagent] Auto-session renewal failed: %s', (err as Error).message);
        }
      }, SESSION_RENEW_MS);
      if (this.renewTimer.unref) this.renewTimer.unref();
    }

    // 8. 已有服务（TelAgent 直连合约 + 其他服务）
    const contracts = new ContractProvider(this.config.chain);
    const gasService = new GasService(contracts);
    // ... groupService, messageService, etc. 保持现有创建逻辑 ...

    // 9. 组装 RuntimeContext
    const ctx: RuntimeContext = {
      identityService: this.identityService,
      groupService: undefined as any,       // TODO: 保持现有创建逻辑
      gasService,
      messageService: undefined as any,     // TODO: 同上
      attachmentService: undefined as any,
      federationService: undefined as any,
      monitoringService: undefined as any,
      keyLifecycleService: undefined as any,
      // ── 新增 ──
      clawnetGateway: this.clawnetGateway,
      sessionManager: this.sessionManager,
      nonceManager: this.nonceManager,
    };

    // 10. 启动 API server（含 session + clawnet 路由）
    // ... 现有 ApiServer 创建逻辑，router.ts 已注册新路由 ...

    logger.info('[telagent] Node started on :%d', this.config.port);
  }

  async stop(): Promise<void> {
    logger.info('[telagent] Shutting down...');

    // 1. 清除续期定时器
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = undefined;
    }

    // 2. 销毁所有 session
    this.sessionManager?.lockAll();

    // 3. 停止已有服务
    // ... 现有 stop 逻辑 ...

    // 4. 最后停止自管 ClawNet Node
    if (this.managedClawNet) {
      await this.managedClawNet.stop();
      this.managedClawNet = undefined;
      logger.info('[telagent] Managed ClawNet Node stopped');
    }

    logger.info('[telagent] Node stopped');
  }

  /** 供内部服务使用的 auto-session token */
  getAutoSessionToken(): string {
    if (!this.autoSessionToken) {
      throw new Error('No auto-session available.');
    }
    return this.autoSessionToken;
  }
}
```

---

### Step 6.4 — 更新 config.ts 新增字段

**目标**: 在 `loadConfigFromEnv()` 中读取新增 ClawNet 环境变量。

#### 修改 `packages/node/src/config.ts`

新增接口和读取逻辑（已在 Step 0.4 框架中预留）：

```typescript
export interface ClawNetConfig {
  nodeUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  autoDiscover: boolean;
  autoStart: boolean;
}

// 在 loadConfigFromEnv() 中：
const clawnet: ClawNetConfig = {
  nodeUrl: process.env.TELAGENT_CLAWNET_NODE_URL || undefined,
  apiKey: process.env.TELAGENT_CLAWNET_API_KEY || undefined,
  timeoutMs: Number(process.env.TELAGENT_CLAWNET_TIMEOUT_MS || 30_000),
  autoDiscover: process.env.TELAGENT_CLAWNET_AUTO_DISCOVER !== 'false',
  autoStart: process.env.TELAGENT_CLAWNET_AUTO_START !== 'false',
};
```

---

## Phase 7 — 依赖安装 + 编译验证

### Step 7.1 — 安装新依赖

```bash
cd packages/node
pnpm add @claw-network/sdk@^0.2.2 @claw-network/node @claw-network/core
```

**验证**:
```bash
cat packages/node/package.json | grep claw-network
# 应输出 3 个依赖
```

### Step 7.2 — 编译验证

```bash
# 从 monorepo 根目录
pnpm --filter @telagent/protocol build
pnpm --filter @telagent/node build
```

**预期**: 0 errors。

**排查优先级**:
1. import 路径是否带 `.js` 后缀
2. `RuntimeContext` 是否包含 3 个新字段
3. `ClawNetGatewayService` 方法签名是否匹配 SDK
4. `ChainConfig` 是否已删除 `selfDid` 和 `contracts.identity`
5. `ContractProvider` 是否已删除 `identity`/`token`/`router`

### Step 7.3 — 冒烟测试

```bash
export TELAGENT_HOME=/tmp/telagent-test
export TELAGENT_CLAWNET_PASSPHRASE=test-passphrase
export TELAGENT_CLAWNET_AUTO_START=false

node dist/main.js 2>&1 | head -20
# 预期输出: 启动日志或 FATAL 错误（无 ClawNet Node 可用时）
# 不应出现未捕获异常

rm -rf /tmp/telagent-test
```

---

## 附录 A — 完整新增文件清单

| # | 文件路径 | 行数估计 | 主要依赖 |
|---|---|---|---|
| 1 | `packages/node/src/clawnet/discovery.ts` | ~120 | `node:fs`, `node:os`, `managed-node.js` |
| 2 | `packages/node/src/clawnet/managed-node.ts` | ~80 | `@claw-network/node` |
| 3 | `packages/node/src/clawnet/verify-passphrase.ts` | ~50 | `@claw-network/sdk` |
| 4 | `packages/node/src/clawnet/gateway-service.ts` | ~250 | `@claw-network/sdk`, `session-manager`, `nonce-manager` |
| 5 | `packages/node/src/clawnet/session-manager.ts` | ~170 | `node:crypto` |
| 6 | `packages/node/src/clawnet/nonce-manager.ts` | ~100 | — |
| 7 | `packages/node/src/clawnet/index.ts` | ~25 | barrel |
| 8 | `packages/node/src/storage/telagent-paths.ts` | ~80 | `node:os`, `node:path`, `node:fs/promises` |
| 9 | `packages/node/src/storage/secret-store.ts` | ~50 | `node:fs/promises` |
| 10 | `packages/node/src/storage/mnemonic-store.ts` | ~80 | `node:crypto`, `secret-store` |
| 11 | `packages/node/src/storage/passphrase-store.ts` | ~90 | `node:crypto`, `node:os` |
| 12 | `packages/node/src/storage/passphrase-resolver.ts` | ~30 | `passphrase-store` |
| 13 | `packages/node/src/api/routes/session.ts` | ~100 | `express` |
| 14 | `packages/node/src/api/routes/clawnet.ts` | ~250 | `express` |
| 15 | `packages/protocol/src/content-schemas.ts` | ~120 | — |

**总计**: ~1,595 行新代码

---

## 附录 B — 环境变量完整清单

| 环境变量 | 默认值 | 必填 | 说明 |
|---|---|---|---|
| `TELAGENT_HOME` | `~/.telagent` | 否 | TelAgent 数据根目录 |
| `TELAGENT_CLAWNET_NODE_URL` | 自动发现 | 否 | 显式 ClawNet Node URL |
| `TELAGENT_CLAWNET_PASSPHRASE` | 空 | 条件* | ClawNet 密钥解锁口令 |
| `TELAGENT_CLAWNET_AUTO_START` | `true` | 否 | 自动启动嵌入式 ClawNet Node |
| `TELAGENT_CLAWNET_AUTO_DISCOVER` | `true` | 否 | 启用自动发现 |
| `TELAGENT_CLAWNET_API_KEY` | 空 | 否 | 远程 ClawNet Node API Key |
| `TELAGENT_CLAWNET_TIMEOUT_MS` | `30000` | 否 | HTTP 请求超时 |

> \* `TELAGENT_CLAWNET_PASSPHRASE` 在无已有 ClawNet Node 需自动启动时必填。

**已废弃（设置后拒绝启动）**:
- `TELAGENT_DATA_DIR` → 替换为 `TELAGENT_HOME`
- `TELAGENT_SELF_DID` → 运行时从 ClawNet Node 获取
- `TELAGENT_IDENTITY_CONTRACT` → 通过 ClawNet SDK 访问
- `TELAGENT_TOKEN_CONTRACT` → 通过 ClawNet SDK 访问

---

## 附录 C — 已知批量操作 Nonce 消耗表

| 操作 | SDK 方法 | event 数量 | nonce 消耗 |
|---|---|---|---|
| 转账 | `wallet.transfer()` | 1 | 1 |
| 创建 Escrow | `wallet.createEscrow()` | 1 | 1 |
| 释放 Escrow | `wallet.releaseEscrow()` | 1 | 1 |
| 发布任务 | `markets.tasks.publish()` | 1 | 1 |
| 竞标 | `markets.tasks.bid()` | 1 | 1 |
| **接受竞标** | `markets.tasks.acceptBid()` | **5** | **5** |
| **完成任务** | `markets.tasks.complete()` | **2-4** | **2-4** |
| 提交评价 | `reputation.submit()` | 1 | 1 |

> event 数量以保守估计为准，实际部署时从 ClawNet Node 源码确认。

---

## 附录 D — 执行顺序总结

```
Phase 0 (破坏性清理)
  ├── Step 0.1: 删除废弃环境变量 + config 字段
  ├── Step 0.2: 删除 CLAW_IDENTITY_ABI + ContractProvider.identity/token/router
  ├── Step 0.3: 创建 telagent-paths.ts（~/.telagent 路径模块）
  └── Step 0.4: 迁移 config.ts（TELAGENT_DATA_DIR → TELAGENT_HOME, + ClawNet 配置）

Phase 1 (ClawNet 发现 + 自动启动)
  ├── Step 1.1: 创建 discovery.ts
  ├── Step 1.2: 创建 managed-node.ts
  └── Step 1.3: 创建 verify-passphrase.ts

Phase 2 (安全存储)
  ├── Step 2.1: 创建 secret-store.ts
  ├── Step 2.2: 创建 mnemonic-store.ts
  ├── Step 2.3: 创建 passphrase-store.ts
  └── Step 2.4: 创建 passphrase-resolver.ts

Phase 3 (Session + Nonce)
  ├── Step 3.1: 创建 session-manager.ts
  ├── Step 3.2: 创建 nonce-manager.ts
  └── Step 3.3: Session API 路由预告

Phase 4 (Gateway + Identity 迁移)
  ├── Step 4.1: 创建 gateway-service.ts
  ├── Step 4.2: 重写 identity-adapter-service.ts
  ├── Step 4.3: 清理 contract-provider.ts（删除 identity/token/router）
  ├── Step 4.4: 迁移 wallets.ts 路由
  └── Step 4.5: 验证 identities.ts 路由

Phase 5 (ContentType + API 路由)
  ├── Step 5.1: 扩展 ContentType + 创建 content-schemas.ts
  ├── Step 5.2: 创建 session.ts + clawnet.ts 路由
  └── Step 5.3: 注册新路由到 router.ts

Phase 6 (核心重构)
  ├── Step 6.1: 更新 RuntimeContext 类型
  ├── Step 6.2: 创建 clawnet/index.ts barrel
  ├── Step 6.3: 重写 app.ts（完整启动流程）
  └── Step 6.4: 更新 config.ts 新字段

Phase 7 (依赖 + 验证)
  ├── Step 7.1: pnpm add @claw-network/{sdk,node,core}
  ├── Step 7.2: 编译验证
  └── Step 7.3: 冒烟测试
```

**总 Step 数**: 26 步
**新增代码**: ~1,595 行
**修改文件**: 9 个
**新增文件**: 15 个

---

*文档版本: v1.0*
*基于 RFC: clawnet-deep-integration-rfc.md v0.2*
*生成时间: 2026-03-05*
