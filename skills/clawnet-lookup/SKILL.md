---
name: clawnet-lookup
description: "Look up ClawNet / clawnetd information from the sibling clawnet project. Use when encountering clawnet, clawnetd, ClawNet SDK, ClawNet Node, ClawNet API, DID, identity, reputation, wallet, markets, contracts, escrow, DAO, messaging topics, or P2P transport integration questions. Searches clawnet docs, source code, API specs, and SDK to answer integration questions."
---

# ClawNet Project Lookup

Cross-reference ClawNet project docs, APIs, and source code when working on TelAgent integration.

## When to Use

- Investigating ClawNet SDK methods (messaging, identity, wallet, markets, reputation, contracts, DAO)
- Understanding clawnetd daemon behavior, configuration, or API endpoints
- Debugging P2P transport issues between TelAgent and ClawNet
- Checking ClawNet API request/response schemas
- Understanding DID, identity registration, key rotation, or passphrase flows
- Looking up ClawNet smart contract ABIs or service contract details
- Reviewing ClawNet messaging topics, WebSocket subscriptions, or delivery semantics

## ClawNet Project Location

The ClawNet project is located at the **parent directory** of the current workspace:

```
CLAWNET_ROOT = <workspace root>/../clawnet
```

> **路径约定**：下文中所有 clawnet 内的路径均相对于 `CLAWNET_ROOT`，例如 `docs/API_REFERENCE.md` 实际为 `<workspace root>/../clawnet/docs/API_REFERENCE.md`。
> 使用 `read_file` 时，先用 `list_dir` 确认 workspace root 的父目录下存在 `clawnet/` 文件夹，再拼接完整路径。

## Project Structure

```
clawnet/
├── docs/                        # Architecture, API reference, guides
│   ├── ARCHITECTURE.md          # System architecture overview
│   ├── API_REFERENCE.md         # REST API documentation
│   ├── API_ROUTE_CATALOG.md     # Complete route catalog
│   ├── SDK_GUIDE.md             # SDK usage guide
│   ├── IDENTITY.md              # DID & identity system
│   ├── WALLET.md                # Wallet management
│   ├── MARKETS.md               # Task markets
│   ├── MARKETS_ADVANCED.md      # Advanced market features
│   ├── REPUTATION.md            # Reputation system
│   ├── SMART_CONTRACTS.md       # On-chain contracts
│   ├── SERVICE_CONTRACTS.md     # Service contract details
│   ├── DAO.md                   # DAO governance
│   ├── QUICKSTART.md            # Getting started
│   ├── DEPLOYMENT.md            # Deployment guide
│   ├── OPENCLAW_INTEGRATION.md  # Integration with OpenClaw ecosystem
│   ├── api/
│   │   └── openapi.yaml         # OpenAPI spec (authoritative API schema)
│   └── implementation/          # Implementation details
├── packages/
│   ├── node/                    # clawnetd — the ClawNet daemon
│   │   └── src/
│   │       ├── api/             # HTTP routes, middleware, WebSocket
│   │       │   ├── router.ts
│   │       │   ├── routes/      # Route handlers
│   │       │   ├── schemas/     # Zod request/response schemas
│   │       │   ├── ws-messaging.ts  # WebSocket messaging
│   │       │   └── server.ts
│   │       ├── services/        # Core business logic
│   │       │   ├── messaging-service.ts
│   │       │   ├── identity-service.ts
│   │       │   ├── wallet-service.ts
│   │       │   ├── contracts-service.ts
│   │       │   ├── dao-service.ts
│   │       │   └── reputation-service.ts
│   │       ├── p2p/             # P2P networking (sync)
│   │       └── daemon.ts        # Daemon entry point
│   ├── sdk/                     # ClawNet TypeScript SDK
│   │   └── src/
│   │       ├── index.ts
│   │       ├── messaging.ts     # client.messaging.*
│   │       ├── identity.ts      # client.identity.*
│   │       ├── wallet.ts        # client.wallet.*
│   │       ├── markets.ts       # client.markets.*
│   │       ├── reputation.ts    # client.reputation.*
│   │       ├── contracts.ts     # client.contracts.*
│   │       ├── dao.ts           # client.dao.*
│   │       ├── node.ts          # client.node.*
│   │       ├── http.ts          # HTTP transport layer
│   │       └── types.ts         # Shared types
│   ├── sdk-python/              # Python SDK
│   ├── protocol/                # Protocol definitions
│   ├── cli/                     # CLI tool
│   ├── contracts/               # Solidity smart contracts
│   └── wallet/                  # Wallet app
├── skills/                      # ClawNet agent skills
└── scripts/                     # Build & utility scripts
```

## Lookup Procedure

### Step 1: Identify the topic

Determine which ClawNet subsystem is relevant:

| Topic | Primary doc | Primary code |
|-------|------------|--------------|
| API endpoints | `docs/API_REFERENCE.md`, `docs/api/openapi.yaml` | `packages/node/src/api/routes/` |
| SDK methods | `docs/SDK_GUIDE.md` | `packages/sdk/src/` |
| Messaging / P2P | `docs/ARCHITECTURE.md` | `packages/node/src/services/messaging-service.ts`, `packages/sdk/src/messaging.ts` |
| Identity / DID | `docs/IDENTITY.md` | `packages/node/src/services/identity-service.ts`, `packages/sdk/src/identity.ts` |
| Wallet | `docs/WALLET.md` | `packages/node/src/services/wallet-service.ts`, `packages/sdk/src/wallet.ts` |
| Markets / Tasks | `docs/MARKETS.md` | `packages/node/src/services/contracts-service.ts`, `packages/sdk/src/markets.ts` |
| Reputation | `docs/REPUTATION.md` | `packages/sdk/src/reputation.ts` |
| Smart contracts | `docs/SMART_CONTRACTS.md` | `packages/contracts/` |
| DAO | `docs/DAO.md` | `packages/sdk/src/dao.ts` |
| Architecture | `docs/ARCHITECTURE.md` | — |
| Deployment | `docs/DEPLOYMENT.md` | `docker-compose.yml` |

### Step 2: Resolve CLAWNET_ROOT and read the relevant files

1. 获取当前 workspace 根目录（即 telagent 项目根目录）
2. 拼接 `../clawnet` 得到 `CLAWNET_ROOT`
3. 用 `list_dir` 验证目录存在
4. 用 `read_file` 读取目标文件，路径格式：

```
{CLAWNET_ROOT}/docs/<DOC>.md
{CLAWNET_ROOT}/packages/<package>/src/<file>.ts
```

For API schema questions, read the OpenAPI spec:
```
{CLAWNET_ROOT}/docs/api/openapi.yaml
```

### Step 3: Cross-reference with TelAgent integration code

TelAgent's ClawNet integration points:

| TelAgent component | File |
|---|---|
| ClawNet gateway service | `packages/node/src/clawnet/gateway-service.ts` |
| ClawNet discovery | `packages/node/src/clawnet/discovery.ts` |
| Managed node (auto-start clawnetd) | `packages/node/src/clawnet/managed-node.ts` |
| Session manager | `packages/node/src/clawnet/session-manager.ts` |
| Nonce manager | `packages/node/src/clawnet/nonce-manager.ts` |
| Passphrase verification | `packages/node/src/clawnet/verify-passphrase.ts` |
| P2P transport service | `packages/node/src/services/clawnet-transport-service.ts` |
| clawnetd process manager | `packages/node/src/clawnet/clawnetd-process.ts` |

### Step 4: Search for specifics

If the doc/code lookup is insufficient, search the clawnet codebase:

- Use `grep_search` with `includePattern` targeting `../clawnet/**` files
- Use `read_file` to inspect specific clawnet source files
- Check `packages/node/src/api/routes/` for endpoint implementations
- Check `packages/node/src/api/schemas/` for request/response Zod schemas

## TelAgent ↔ ClawNet Integration Summary

- **Transport**: TelAgent uses ClawNet SDK `client.messaging.send()` for P2P delivery
- **Identity**: DID resolved via ClawNet identity service
- **Config**: `TELAGENT_CLAWNET_NODE_URL`, `TELAGENT_CLAWNET_API_KEY`, `TELAGENT_CLAWNET_AUTO_DISCOVER`, `TELAGENT_CLAWNET_AUTO_START`
- **Topics**: TelAgent subscribes to `telagent/*` messaging topics via WebSocket
- **Inbound**: WebSocket subscription with `sinceSeq` for reconnection recovery
- **Outbound**: SDK call with idempotency, compression, priority, multicast support
