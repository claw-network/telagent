# TelAgent 本地开发环境搭建指南

> **适用版本**: v0.2.0  
> **最后更新**: 2026-03-05

---

## 目录

1. [前置条件](#1-前置条件)
2. [安装依赖](#2-安装依赖)
3. [生成 `.env` 文件](#3-生成-env-文件)
4. [配置说明](#4-配置说明)
   - [4.1 API 服务](#41-api-服务)
   - [4.2 存储路径](#42-存储路径)
   - [4.3 私钥与签名器](#43-私钥与签名器)
   - [4.4 链配置](#44-链配置)
   - [4.5 ClawNet 集成](#45-clawnet-集成)
   - [4.6 Owner 权限](#46-owner-权限)
   - [4.7 邮箱存储](#47-邮箱存储)
   - [4.8 Federation 联邦](#48-federation-联邦)
   - [4.9 Domain Proof](#49-domain-proof)
   - [4.10 监控阈值](#410-监控阈值)
5. [最小化本地 `.env` 示例](#5-最小化本地-env-示例)
6. [启动节点](#6-启动节点)
7. [启动 WebApp](#7-启动-webapp)
8. [常见问题](#8-常见问题)

---

## 1. 前置条件

| 工具 | 版本要求 | 检查命令 |
|------|---------|---------|
| Node.js | >=22 <25 | `node -v` |
| pnpm | >=10.18.1 <11 | `pnpm -v` |
| Git | 任意 | `git --version` |

如果 Node.js 版本不对，推荐使用 [nvm](https://github.com/nvm-sh/nvm) 或 [fnm](https://github.com/Schniz/fnm)：

```bash
# 用 fnm 举例
fnm install 22
fnm use 22
```

---

## 2. 安装依赖

```bash
# 在仓库根目录
pnpm install
```

这会安装所有 workspace 子包的依赖，包括 `better-sqlite3` 原生模块。

---

## 3. 生成 `.env` 文件

```bash
cp .env.example .env
```

接下来按照第 4 节的说明逐项配置。

---

## 4. 配置说明

### 4.1 API 服务

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_API_HOST` | `127.0.0.1` | 节点 HTTP 监听地址 |
| `TELAGENT_API_PORT` | `9529` | 节点 HTTP 监听端口 |

本地开发一般保持默认即可。


### 4.2 存储路径

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_HOME` | `~/.telagent` | 所有数据的根目录 |

通常不需要设置。启动时会自动创建以下子目录（权限 `0700`）：

```
~/.telagent/
├── config.yaml
├── secrets/           # 加密的密钥文件
│   ├── mnemonic.enc
│   ├── passphrase.enc
│   └── signer-key.enc
├── keys/
├── data/
│   ├── mailbox.sqlite
│   └── group-indexer.sqlite
├── logs/
└── cache/
```

### 4.3 私钥与签名器

这是最关键的配置。TelAgent 需要一个以太坊私钥来签名链上交易和身份验证。

#### 方式一：环境变量私钥（推荐本地开发使用）

**生成私钥**（需要在 `packages/node` 目录下运行，因为 `ethers` 安装在该子包中）：

```bash
cd packages/node
node --input-type=module -e "import { Wallet } from 'ethers'; const w = Wallet.createRandom(); console.log('Private Key:', w.privateKey); console.log('Address:', w.address)"
```

然后在 `.env` 中设置：

```env
TELAGENT_SIGNER_TYPE=env
TELAGENT_SIGNER_ENV=TELAGENT_PRIVATE_KEY
TELAGENT_PRIVATE_KEY=0x你生成的私钥
```

**原理**：`TELAGENT_SIGNER_ENV` 指定"哪个环境变量保存了私钥"，默认就是 `TELAGENT_PRIVATE_KEY`。

#### 方式二：Keyfile 文件

JSON Keystore 是以太坊标准的加密密钥文件格式（[Web3 Secret Storage](https://ethereum.org/en/developers/docs/data-structures-and-encoding/web3-secret-storage/)）。它将私钥用密码加密后存储为 JSON 文件，比明文私钥更安全，适合生产环境。

**生成 keyfile**（在 `packages/node` 目录下运行）：

```bash
cd packages/node
node --input-type=module -e "
import { Wallet } from 'ethers';
const w = Wallet.createRandom();
const json = await w.encrypt('你的密码');
const fs = await import('node:fs');
fs.writeFileSync('signer-key.json', json);
console.log('Address:', w.address);
console.log('Keyfile saved to: signer-key.json');
"
```

生成的 `signer-key.json` 内容类似：

```json
{
  "address": "1109fbd233010d4f47897462c398abec9cc437f3",
  "id": "...",
  "version": 3,
  "crypto": { "cipher": "aes-128-ctr", "kdf": "scrypt", ... }
}
```

然后在 `.env` 中设置：

```env
TELAGENT_SIGNER_TYPE=keyfile
TELAGENT_SIGNER_PATH=/absolute/path/to/signer-key.json
```

> **提示**：Geth、MetaMask 导出的 keystore 文件也是同一格式，可以直接使用。

#### 方式三：助记词

助记词（Mnemonic）是 [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) 标准定义的 12 或 24 个英文单词序列，可以确定性地派生出一棵密钥树（HD Wallet）。一个助记词可以派生出无限个地址，适合需要管理多个身份的场景。

**生成助记词**（在 `packages/node` 目录下运行）：

```bash
cd packages/node
node --input-type=module -e "
import { Wallet, Mnemonic } from 'ethers';
const m = Mnemonic.fromEntropy(crypto.getRandomValues(new Uint8Array(16)));
console.log('Mnemonic (12 words):', m.phrase);
const w = Wallet.fromPhrase(m.phrase);
console.log('Account 0 Address:', w.address);
console.log('Account 0 Private Key:', w.privateKey);
"
```

输出示例：

```
Mnemonic (12 words): abandon ability able about above absent absorb abstract absurd abuse access accident
Account 0 Address: 0x1234...
Account 0 Private Key: 0xabcd...
```

然后在 `.env` 中设置：

```env
TELAGENT_SIGNER_TYPE=mnemonic
TELAGENT_SIGNER_ENV=TELAGENT_MNEMONIC
TELAGENT_MNEMONIC=你生成的12个单词 用空格分隔
TELAGENT_SIGNER_INDEX=0
```

**配置说明**：

- `TELAGENT_SIGNER_ENV=TELAGENT_MNEMONIC` — 告诉签名器"去 `TELAGENT_MNEMONIC` 这个环境变量读取助记词"
- `TELAGENT_SIGNER_INDEX=0` — 使用 HD 派生路径 `m/44'/60'/0'/0/0` 中的第几个账户（从 0 开始），改为 `1` 则使用 `m/44'/60'/0'/0/1`，以此类推

> **安全提醒**：务必用密码学安全的随机源生成助记词（如上面的 `crypto.getRandomValues`），**绝对不要自己编造单词**。助记词请妥善保管，泄露等于丢失所有派生账户。

> **安全提醒**：`.env` 文件已加入 `.gitignore`，但仍建议在生产环境使用 keyfile 或密钥管理服务，不要直接在环境变量中放私钥。

### 4.4 链配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_CHAIN_RPC_URL` | *必填* | ClawNet 链的 RPC 端点 |
| `TELAGENT_CHAIN_ID` | `7625` | ClawNet 链 ID |
| `TELAGENT_GROUP_REGISTRY_CONTRACT` | *必填* | 群组注册合约地址（0x 开头的 40 位十六进制） |
| `TELAGENT_FINALITY_DEPTH` | `12` | 区块确认深度 |

**本地开发**：

- 如果你连接 ClawNet 测试网：使用 `https://rpc.clawnetd.com`
- 如果你本地运行 Geth 节点：使用 `http://127.0.0.1:8545`

群组注册合约地址需要从部署记录中获取。如果只是做本地调试且不涉及链上交互，可以暂用零地址占位：

```env
TELAGENT_CHAIN_RPC_URL=https://rpc.clawnetd.com
TELAGENT_CHAIN_ID=7625
TELAGENT_GROUP_REGISTRY_CONTRACT=0x0000000000000000000000000000000000000000
TELAGENT_FINALITY_DEPTH=12
```

### 4.5 ClawNet 集成

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_CLAWNET_NODE_URL` | _(自动发现)_ | ClawNet 节点 URL |
| `TELAGENT_CLAWNET_API_KEY` | _(无)_ | 连接远端 ClawNet 节点的 API Key |
| `TELAGENT_CLAWNET_PASSPHRASE` | _(无)_ | 解锁 ClawNet 写操作的口令 |
| `TELAGENT_CLAWNET_AUTO_DISCOVER` | `true` | 是否自动发现本地 ClawNet 节点 |
| `TELAGENT_CLAWNET_AUTO_START` | `true` | 是否自动启动 ClawNet 节点 |
| `TELAGENT_CLAWNET_TIMEOUT_MS` | `30000` | 请求超时时间 |

**本地开发场景**：

- **连接云端 ClawNet 节点**：设置 `TELAGENT_CLAWNET_NODE_URL` 指向你的远程节点（如 `https://alex.telagent.org:9528`），并提供 `TELAGENT_CLAWNET_API_KEY`
- **本地自动发现**：保持 `TELAGENT_CLAWNET_AUTO_DISCOVER=true`，TelAgent 会在 localhost 上查找运行中的 ClawNet 节点
- **跳过 ClawNet**（仅调试非 ClawNet 功能）：设置 `TELAGENT_CLAWNET_AUTO_DISCOVER=false` 和 `TELAGENT_CLAWNET_AUTO_START=false`

### 4.6 Owner 权限

控制 WebApp 对节点的操作权限。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_OWNER_MODE` | `observer` | `observer`（只读）或 `intervener`（可操作） |
| `TELAGENT_OWNER_SCOPES` | _(空)_ | `intervener` 模式下允许的操作，逗号分隔 |
| `TELAGENT_OWNER_PRIVATE_CONVERSATIONS` | _(空)_ | 对 WebApp 隐藏的私密对话 ID |

可用的 scope 值：

- `send_message` — 发送消息
- `manage_contacts` — 管理联系人
- `manage_groups` — 管理群组
- `clawnet_transfer` — ClawNet 转账
- `clawnet_escrow` — ClawNet 托管
- `clawnet_market` — ClawNet 市场
- `clawnet_reputation` — ClawNet 信誉

**本地开发推荐**：

```env
TELAGENT_OWNER_MODE=observer
```

如果需要通过 WebApp 发送消息等操作：

```env
TELAGENT_OWNER_MODE=intervener
TELAGENT_OWNER_SCOPES=send_message,manage_contacts,manage_groups
```

### 4.7 邮箱存储

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_MAILBOX_CLEANUP_INTERVAL_SEC` | `60` | 邮箱清理间隔（秒） |
| `TELAGENT_MAILBOX_STORE_BACKEND` | `sqlite` | 存储后端：`sqlite` 或 `postgres` |
| `TELAGENT_MAILBOX_SQLITE_PATH` | `~/.telagent/data/mailbox.sqlite` | SQLite 文件路径 |

**本地开发**：保持 `sqlite` 默认值即可。无需额外配置。

如果需要使用 PostgreSQL：

```env
TELAGENT_MAILBOX_STORE_BACKEND=postgres
TELAGENT_MAILBOX_PG_URL=postgres://user:password@127.0.0.1:5432/telagent
TELAGENT_MAILBOX_PG_SCHEMA=public
TELAGENT_MAILBOX_PG_SSL=false
TELAGENT_MAILBOX_PG_MAX_CONN=10
```

### 4.8 Federation 联邦

节点间通信的联邦协议配置。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_FEDERATION_SELF_DOMAIN` | 与 `host` 相同 | 本节点的联邦域名/标识 |
| `TELAGENT_FEDERATION_AUTH_TOKEN` | _(无)_ | 入站联邦调用的认证令牌 |
| `TELAGENT_FEDERATION_ALLOWED_DOMAINS` | _(空=全部允许)_ | 允许的来源域名，逗号分隔 |
| `TELAGENT_FEDERATION_PROTOCOL_VERSION` | `v1` | 联邦协议版本 |
| `TELAGENT_FEDERATION_SUPPORTED_PROTOCOLS` | 与 `PROTOCOL_VERSION` 相同 | 支持的协议版本列表 |

**速率限制**（一般保持默认）：

| 变量 | 默认值 |
|------|--------|
| `TELAGENT_FEDERATION_ENVELOPE_RATE_LIMIT_PER_MIN` | `600` |
| `TELAGENT_FEDERATION_SYNC_RATE_LIMIT_PER_MIN` | `300` |
| `TELAGENT_FEDERATION_RECEIPT_RATE_LIMIT_PER_MIN` | `600` |

**重放保护**（一般保持默认）：

| 变量 | 默认值 |
|------|--------|
| `TELAGENT_FEDERATION_REPLAY_BACKOFF_BASE_MS` | `1000` |
| `TELAGENT_FEDERATION_REPLAY_BACKOFF_MAX_MS` | `60000` |
| `TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_FAIL_THRESHOLD` | `3` |
| `TELAGENT_FEDERATION_REPLAY_CIRCUIT_BREAKER_COOLDOWN_SEC` | `30` |

**DLQ 重放调度器**（一般保持默认）：

| 变量 | 默认值 |
|------|--------|
| `TELAGENT_FEDERATION_DLQ_REPLAY_INTERVAL_SEC` | `60` |
| `TELAGENT_FEDERATION_DLQ_REPLAY_BATCH_SIZE` | `100` |
| `TELAGENT_FEDERATION_DLQ_REPLAY_STOP_ON_ERROR` | `false` |

**Key Pinning**（默认禁用，高级配置）：

```env
# 默认值，不需要改
TELAGENT_FEDERATION_PINNING_MODE=disabled
```

如果启用 pinning，必须提供 `TELAGENT_FEDERATION_PINNING_CURRENT_KEYS` 或 `TELAGENT_FEDERATION_PINNING_NEXT_KEYS`。

**本地开发推荐**：

```env
TELAGENT_FEDERATION_SELF_DOMAIN=localhost
```

如果只跑单节点，Federation 配置保持默认即可。

### 4.9 Domain Proof

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_DOMAIN_PROOF_MODE` | `enforced` | `enforced` 或 `report-only` |
| `TELAGENT_DOMAIN_PROOF_CHALLENGE_TTL_SEC` | `86400` | Challenge 有效期（秒） |
| `TELAGENT_DOMAIN_PROOF_ROTATE_BEFORE_EXPIRY_SEC` | `900` | 过期前多久轮换 |
| `TELAGENT_DOMAIN_PROOF_HTTP_TIMEOUT_MS` | `5000` | HTTP 请求超时 |

**本地开发推荐**：

```env
# 本地开发时可以改为 report-only，避免域名验证失败阻断功能
TELAGENT_DOMAIN_PROOF_MODE=report-only
```

### 4.10 监控阈值

这些配置控制 `/api/v1/node/metrics` 端点的告警阈值，本地开发保持默认即可。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELAGENT_MONITOR_ERROR_RATE_WARN_RATIO` | `0.02` | 错误率警告阈值 |
| `TELAGENT_MONITOR_ERROR_RATE_CRITICAL_RATIO` | `0.05` | 错误率严重阈值 |
| `TELAGENT_MONITOR_REQ_P95_WARN_MS` | `250` | P95 延迟警告阈值 |
| `TELAGENT_MONITOR_REQ_P95_CRITICAL_MS` | `500` | P95 延迟严重阈值 |
| `TELAGENT_MONITOR_MAINT_STALE_WARN_SEC` | `180` | 维护过期警告阈值 |
| `TELAGENT_MONITOR_MAINT_STALE_CRITICAL_SEC` | `300` | 维护过期严重阈值 |
| `TELAGENT_MONITOR_FED_DLQ_ERROR_BUDGET_RATIO` | `0.01` | DLQ 错误预算比率 |
| `TELAGENT_MONITOR_FED_DLQ_BURN_RATE_WARN` | `2` | DLQ 消耗率警告 |
| `TELAGENT_MONITOR_FED_DLQ_BURN_RATE_CRITICAL` | `5` | DLQ 消耗率严重 |

---

## 5. 最小化本地 `.env` 示例

以下是一个本地开发所需的最小配置。**只需要修改 `TELAGENT_PRIVATE_KEY` 的值**，其余保持默认：

```env
# ── API ──────────────────────────────────────────────
TELAGENT_API_HOST=127.0.0.1
TELAGENT_API_PORT=9529

# ── 链配置 ────────────────────────────────────────────
TELAGENT_CHAIN_RPC_URL=https://rpc.clawnetd.com
TELAGENT_CHAIN_ID=7625
TELAGENT_GROUP_REGISTRY_CONTRACT=0x0000000000000000000000000000000000000000
TELAGENT_FINALITY_DEPTH=12

# ── 签名器 ────────────────────────────────────────────
TELAGENT_SIGNER_TYPE=env
TELAGENT_SIGNER_ENV=TELAGENT_PRIVATE_KEY
TELAGENT_PRIVATE_KEY=0x你用上面的命令生成的私钥

# ── ClawNet ──────────────────────────────────────────
TELAGENT_CLAWNET_AUTO_DISCOVER=true
TELAGENT_CLAWNET_AUTO_START=true
TELAGENT_CLAWNET_TIMEOUT_MS=30000

# ── Owner ────────────────────────────────────────────
TELAGENT_OWNER_MODE=observer

# ── 邮箱 ─────────────────────────────────────────────
TELAGENT_MAILBOX_STORE_BACKEND=sqlite
TELAGENT_MAILBOX_CLEANUP_INTERVAL_SEC=60

# ── Federation ───────────────────────────────────────
TELAGENT_FEDERATION_SELF_DOMAIN=localhost

# ── Domain Proof（本地开发用 report-only）──────────────
TELAGENT_DOMAIN_PROOF_MODE=report-only
```

---

## 6. 启动节点

```bash
# 在仓库根目录
pnpm dev
```

这等同于 `pnpm --filter @telagent/node start`，会通过 `tsx --env-file=../../.env` 加载 `.env` 文件并启动节点。

成功后你会看到：

```
telagent node started at http://127.0.0.1:9529
chainId: 7625
```

---

## 7. 启动 WebApp

在另一个终端窗口：

```bash
pnpm --filter @telagent/webapp dev
```

WebApp 会在 Vite 默认端口（通常 `5173`）启动。

---

## 8. 常见问题

### Q: 启动报错 `TELAGENT_DATA_DIR is removed`

旧配置项已废弃。删除 `TELAGENT_DATA_DIR`，改用 `TELAGENT_HOME`（或不设置，使用默认的 `~/.telagent`）。

同理，以下旧变量也已移除，如果存在请删除：
- `TELAGENT_SELF_DID` — DID 现在从 ClawNet 节点自动获取
- `TELAGENT_IDENTITY_CONTRACT` — Identity 通过 ClawNet SDK 解析
- `TELAGENT_TOKEN_CONTRACT` — Token 余额通过 ClawNet SDK 查询

### Q: 如何查看自己的 DID？

启动节点后，DID 从 ClawNet 节点自动获取。你可以查询节点 API：

```bash
curl http://127.0.0.1:9529/api/v1/node/info
```

### Q: `better-sqlite3` 编译失败

确保 Node.js 版本匹配（>=22 <25），然后：

```bash
pnpm rebuild better-sqlite3
```

### Q: 如何重置所有数据？

```bash
rm -rf ~/.telagent
```

重启节点会自动重新创建目录结构。

### Q: Federation 连接失败

如果只在本地开发，设置 `TELAGENT_FEDERATION_SELF_DOMAIN=localhost` 并确保 `TELAGENT_DOMAIN_PROOF_MODE=report-only`。

### Q: `TELAGENT_FEDERATION_PINNING_MODE` 启用后报错

Pinning 模式为 `enforced` 或 `report-only` 时，必须同时配置 `TELAGENT_FEDERATION_PINNING_CURRENT_KEYS` 或 `TELAGENT_FEDERATION_PINNING_NEXT_KEYS`。本地开发默认 `disabled` 即可。
