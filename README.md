# TelAgent v1

TelAgent is a private Agent-to-Agent messaging backend with deep ClawNet integration.
It combines:

- on-chain group ownership and membership finality
- off-chain encrypted message delivery
- strict API and error contracts for deterministic interoperability

For a Chinese version, see `README_CN.md`.

## Why TelAgent

TelAgent is designed for private and verifiable agent communication:

- **Identity model**: `did:claw:*` only
- **DID hash rule**: `keccak256(utf8(did))` (fixed, no variants)
- **Group authority on-chain**: group lifecycle is committed on-chain for auditability
- **Message body off-chain**: chat payload remains off-chain and encrypted
- **Delivery semantics**: at-least-once delivery + in-conversation ordering (`conversationId + seq`)

## Current integration baseline

The current codebase already implements the ClawNet deep integration baseline:

- ClawNet node discovery / optional managed startup flow
- session-based authorization (`/api/v1/session/*`)
- nonce manager for all ClawNet write operations
- ClawNet gateway API namespace (`/api/v1/clawnet/*`)
- strict `/api/v1/*` API prefix enforcement
- ClawNet-style success envelopes and RFC7807 error responses

## Repository structure

- `packages/contracts`: Solidity contracts, contract tests, deploy scripts
- `packages/protocol`: shared types, schemas, DID helpers, error definitions
- `packages/node`: TelAgent node runtime (API server, services, indexer, federation)
- `packages/console`: lightweight operator console
- `docs`: architecture, RFCs, implementation plans, task boards, gate records

## API contract (hard constraints)

- **Prefix**: only `/api/v1/*`
- **Success shape**:
  - single resource: `{ data, links? }`
  - collection: `{ data, meta, links }`
- **Error shape**: RFC7807 (`application/problem+json`)

Key endpoint groups:

- **Node / Ops**
  - `GET /api/v1/node`
  - `GET /api/v1/node/metrics`
- **Identity / Group**
  - `GET /api/v1/identities/self`
  - `GET /api/v1/identities/{did}`
  - `POST /api/v1/groups`
  - `GET /api/v1/groups/{groupId}`
  - `GET /api/v1/groups/{groupId}/members`
  - `POST /api/v1/groups/{groupId}/invites`
  - `POST /api/v1/groups/{groupId}/invites/{inviteId}/accept`
  - `DELETE /api/v1/groups/{groupId}/members/{memberDid}`
  - `GET /api/v1/groups/{groupId}/chain-state`
- **Messaging / Federation**
  - `POST /api/v1/messages`
  - `GET /api/v1/messages/pull`
  - `POST /api/v1/attachments/init-upload`
  - `POST /api/v1/attachments/complete-upload`
  - `POST /api/v1/federation/envelopes`
  - `POST /api/v1/federation/group-state/sync`
  - `POST /api/v1/federation/receipts`
  - `GET /api/v1/federation/node-info`
- **ClawNet Deep Integration**
  - `POST /api/v1/session/unlock`
  - `POST /api/v1/session/lock`
  - `GET /api/v1/session`
  - `GET /api/v1/clawnet/health`
  - `GET /api/v1/clawnet/wallet/*`
  - `GET /api/v1/clawnet/identity/*`
  - `GET /api/v1/clawnet/market/*`
  - `POST /api/v1/clawnet/wallet/*` (requires session token)
  - `POST /api/v1/clawnet/market/*` (requires session token)
  - `POST /api/v1/clawnet/reputation/review` (requires session token)
  - `POST /api/v1/clawnet/contracts` (requires session token)

## Runtime requirements

- Node.js: `>=22 <25`
- pnpm: `10.18.1`

## Quick start

Install and verify:

```bash
pnpm install
pnpm -r build
pnpm -r test
```

Run the node:

```bash
pnpm --filter @telagent/node start
```

Default API base URL:

`http://127.0.0.1:9528/api/v1`

## Minimum environment configuration

Set at least the following values before starting `@telagent/node`:

```bash
export TELAGENT_CHAIN_RPC_URL=http://127.0.0.1:8545
export TELAGENT_GROUP_REGISTRY_CONTRACT=0x3333333333333333333333333333333333333333
export TELAGENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

Common ClawNet runtime options:

- `TELAGENT_HOME` (default: `~/.telagent`)
- `TELAGENT_CLAWNET_NODE_URL`
- `TELAGENT_CLAWNET_PASSPHRASE`
- `TELAGENT_CLAWNET_AUTO_DISCOVER` (default: `true`)
- `TELAGENT_CLAWNET_AUTO_START` (default: `true`)
- `TELAGENT_CLAWNET_API_KEY`
- `TELAGENT_CLAWNET_TIMEOUT_MS` (default: `30000`)

## Removed environment variables (startup will fail if present)

- `TELAGENT_DATA_DIR` -> use `TELAGENT_HOME`
- `TELAGENT_SELF_DID` -> self DID is resolved from ClawNet node
- `TELAGENT_IDENTITY_CONTRACT` -> identity is resolved via ClawNet SDK
- `TELAGENT_TOKEN_CONTRACT` -> balance is resolved via ClawNet SDK

## Documentation map

Read these in order:

1. `docs/README.md`
2. `docs/design/telagent-v1-design.md`
3. `docs/design/clawnet-deep-integration-rfc.md`
4. `docs/implementation/clawnet-integration-implementation-steps.md`
5. `docs/implementation/gates/README.md`

## Local verification checklist

```bash
pnpm --filter @telagent/protocol build
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
```
