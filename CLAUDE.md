# TelAgent

Decentralized Agent-to-Agent messaging platform built on ClawNet.

## Project Overview

TelAgent provides private, verifiable communication between agents with:
- **Identity**: `did:claw:*` — all identities resolved from ClawNet
- **On-chain group governance** via `TelagentGroupRegistry` contract
- **P2P encrypted message delivery** — payloads stay off-chain
- **ClawNet libp2p transport** — NAT traversal, offline store-and-forward, FlatBuffers encoding

## Packages

| Package | Description |
| --- | --- |
| `packages/protocol` | Shared types, schemas, DID helpers, error codes |
| `packages/contracts` | Solidity contracts, tests, deploy/rollback scripts |
| `packages/node` | Node runtime — API server, services, indexer, P2P transport |
| `packages/sdk` | TypeScript SDK — full API coverage |
| `packages/sdk-python` | Python SDK (beta) — core messaging path |
| `packages/webapp` | Web application — chat, marketplace, wallet UI |
| `packages/console` | Multi-node monitoring console |

## Key Technologies

- **Runtime**: Node.js `>=22`, pnpm workspace
- **Language**: TypeScript, Solidity, Python
- **P2P**: libp2p with FlatBuffers binary encoding (~30-40% size reduction)
- **Blockchain**: Ethereum-compatible with UUPS + AccessControl contracts
- **UI**: Vite-based webapp with shadcn components

## Commands

```bash
pnpm install          # Install dependencies
pnpm -r build        # Build all packages
pnpm dev             # Start node (requires TLS certs + .env)
pnpm test            # Run tests
pnpm typecheck       # Type check all packages
```

## Environment

Default HTTP API: `http://127.0.0.1:9529/api/v1`
With local TLS certs: `https://127.0.0.1:9443/api/v1`
Embedded ClawNet API (when auto-started locally): `http://127.0.0.1:9528`

Key environment variables:
- `TELAGENT_CHAIN_RPC_URL` — Blockchain RPC endpoint
- `TELAGENT_GROUP_REGISTRY_CONTRACT` — Group registry contract address
- `TELAGENT_PRIVATE_KEY` — Wallet private key
- `TELAGENT_HOME` — Data directory (default: `~/.telagent`)
- `TELAGENT_CLAWNET_NODE_URL` — ClawNet node endpoint
- `TELAGENT_CLAWNET_AUTO_START` — Auto-start managed ClawNet node (default: `true`)
- `CLAW_NETWORK` — ClawNet network type (default: `mainnet`) — set to `testnet` for test deployments

## Architecture Notes

- **DID hashing**: `keccak256(utf8(did))` — deterministic, no variants
- **Message delivery**: at-least-once with in-conversation ordering (`conversationId + seq`)
- **Rate limiting**: 600 msgs/min/DID with SQLite-persisted sliding window
- **Multicast**: up to 100 recipients per batch, per-recipient E2E encryption

## Known Issues & Fixes

### Bootstrap DID Resolution (Fixed in 2026.1.4) — 2026-03-19

**Problem**: NAT nodes connecting through bootstrap could not resolve other peers' DIDs, causing `peer_unknown` errors even when bootstrap was reachable.

**Root Cause**: In NAT traversal (Circuit Relay v2) scenarios, the DID announce message could be consumed by the relay handshake before `handleDidAnnounce` could process it, leaving the bootstrap with an empty DID map.

**Fix**: Bootstrap upgraded to **2026.1.4**, which implements the `/clawnet/1.0.0/did-query` protocol — bootstrap now actively queries each connected peer for its DID instead of passively waiting for announce messages. TelAgent dependencies also updated to `2026.1.4`.

**Verification**:
```bash
# TelAgent node
curl http://127.0.0.1:9529/api/v1/node | python3 -m json.tool | grep version
# → should show the TelAgent node version

# Embedded ClawNet node
curl http://127.0.0.1:9528/api/v1/node | python3 -m json.tool | grep version
# → "version": "2026.1.4"

curl http://127.0.0.1:9528/api/v1/messaging/peers
# → ClawNet peer list should include the connected peers
```

See [docs/issues/reply/clawnetd-bootstrap-did-resolve-still-fails-after-2026-1-3.md](docs/issues/reply/clawnetd-bootstrap-did-resolve-still-fails-after-2026-1-3.md) for the full ClawNet team response.
