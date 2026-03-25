# TelAgent — Copilot Instructions (Private)

> ⚠️ This file contains server IPs, SSH keys, and deployment info.
> It is excluded from public sync and replaced by `.github/copilot-instructions.public.md`.

## Project Overview

TelAgent is a decentralized Agent-to-Agent (A2A) messaging platform built on ClawNet.
It provides private, verifiable communication between agents with on-chain group governance,
P2P encrypted message delivery, and an integrated marketplace.

- **Private repo** (daily dev): `claw-network/telagent-dev`
- **Public repo** (open source): `claw-network/telagent`

## Monorepo Structure

```
packages/
  protocol/    — shared types, envelopes, FlatBuffers schemas
  node/        — TelAgent node server (Hono, SQLite/PostgreSQL)
  sdk/         — TypeScript SDK for applications
  webapp/      — React web application (Vite)
  contracts/   — Solidity smart contracts (Hardhat)
scripts/       — Local dev scripts (setup, cert generation, faucet)
docs/design/   — Protocol RFCs and architecture decisions
docs/guides/   — Developer guides
```

## Key Technologies

- **Runtime**: Node.js 22, pnpm workspaces, TypeScript
- **Transport**: ClawNet P2P (libp2p) — NAT traversal, store-and-forward
- **Identity**: `did:claw:*` resolved from ClawNet; `keccak256(utf8(did))` hashing
- **Storage**: SQLite (default) or PostgreSQL via `mailboxStore.backend` config
- **Contracts**: Solidity + Hardhat + OpenZeppelin (UUPS upgradeable)
- **Web**: React + Vite + shadcn/ui + TanStack Query

## Build & Test

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Environment Setup

Copy `.env.example` to `.env` and run `bash scripts/setup.sh` for initial configuration.

## API

Node API runs on `http://localhost:9529` by default.
Full API reference: RFC docs in `docs/design/`.

---

## Infrastructure (Private)

### Production Nodes

| Node | Domain | IP | SSH |
|------|--------|----|-----|
| Alex | `alex.telagent.org` | `173.249.46.252` | `ssh -i ~/.ssh/id_ed25519_clawnet root@173.249.46.252` |
| Bess | `bess.telagent.org` | `167.86.93.216` | `ssh -i ~/.ssh/id_ed25519_clawnet root@167.86.93.216` |

Both nodes run: Ubuntu 24.04, Node.js v22, pnpm 10.30.3+

### DIDs

| Node | DID |
|------|-----|
| Alex | `did:claw:z8MifVfD6GGBeNE4ThZfM3R8tK1daNvrEHWSjRzQuELPA` |
| Bess | `did:claw:z8SQN6QoC3LdE5tg4gRwfdDhY9J6Gpbwe1Vej7KFuqtQA` |

### Service Ports (both nodes)

| Service | Port | Notes |
|---------|------|-------|
| TelAgent API | `127.0.0.1:9529` | Proxied via Caddy → 443 |
| ClawNet Node | `0.0.0.0:9528` | ClawNet RPC |
| Geth (Docker) | `127.0.0.1:8545` | EVM RPC |
| Caddy | `443` | HTTPS entry point |

### File Paths on Server

```
/opt/telagent/.env.cloud          # TelAgent environment config
/opt/telagent/packages/node/      # TelAgent node package
/opt/clawnet/node.env             # ClawNet environment (contains CLAW_PASSPHRASE)
/opt/clawnet/node-data/           # ClawNet data (config.yaml, signer.json)
/etc/caddy/Caddyfile              # Caddy reverse proxy config
```

### Deployment

```bash
# Deploy to a single node
bash scripts/deploy-node.sh alex
bash scripts/deploy-node.sh bess

# Deploy to all nodes
bash scripts/deploy-node.sh all
```

The deploy script:
1. Bumps version (`pnpm run version:patch`)
2. Commits & pushes to git
3. Uploads `scripts/redeploy.sh` to the server
4. Runs `redeploy.sh` on the server (git pull, pnpm install, build, restart systemd)

### Key Environment Variables (.env.cloud)

| Variable | Description |
|----------|-------------|
| `TELAGENT_PRIVATE_KEY` | Node signer private key (different per node) |
| `TELAGENT_CLAWNET_PASSPHRASE` | ClawNet node passphrase |
| `TELAGENT_CHAIN_RPC_URL` | Chain RPC endpoint (local Geth) |
| `TELAGENT_CHAIN_ID` | Chain ID: `7625` |
| `TELAGENT_GROUP_REGISTRY_CONTRACT` | Group registry contract address |
| `CLAW_CHAIN_RPC_URL` | ClawNet chain RPC: `https://rpc.clawnetd.com` |
| `CLAW_CHAIN_IDENTITY_CONTRACT` | DID identity contract |
| `TELAGENT_OWNER_MODE` | Owner mode: `intervener` |

### Local Development

See `localdev/node-a-alex.md` and `localdev/node-b-bess.md` for complete node configurations.
Local `.env` file at repo root contains development keys (Hardhat standard accounts).

### Dual-Repo Sync

Private → public sync is automated via `.github/workflows/sync-public.yml`.
See `skills/sync-public-repo.md` for full documentation.
