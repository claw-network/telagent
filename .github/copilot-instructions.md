# TelAgent — Copilot Instructions (Public)

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
  sdk-python/  — Python SDK
  console/     — CLI tool
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
