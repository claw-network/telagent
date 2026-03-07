---
name: cross-node-check
description: "Run cross-node chat delivery check between two TelAgent cloud nodes. Validates bidirectional message delivery (A→B and B→A) and generates a machine-readable PASS/FAIL report. USE FOR: post-deploy validation, P2P smoke test, CI/CD gating, cross-node debugging."
---

# Cross-Node Chat Check

Validate bidirectional message delivery between two independent TelAgent cloud nodes via P2P transport.

## Prerequisites

- Both nodes running and reachable via HTTPS
- `jq` and `pnpm` installed locally
- Local repo at the same version as deployed nodes
- ClawNet passphrase for both nodes (to obtain session tokens)

## Auth Model

The script calls authenticated endpoints (`/api/v1/keys/register`, `/api/v1/messages`, `/api/v1/messages/pull`). These require a valid `tses_*` session token via `Authorization: Bearer <token>`.

> **Note**: The current script (`run-cross-node-chat-check.ts`) does NOT include auth headers in its fetch calls. Before running, you must either:
> 1. Update the script to pass `Authorization: Bearer <token>` headers, or
> 2. Rely on the auto-session created at node startup (only works for internal `http://127.0.0.1:9529` calls if the auth gate is bypassed — currently it is NOT bypassed for internal calls)

To obtain session tokens manually:

```bash
# Unlock session on Node A
TOKEN_A=$(curl -s -X POST https://alex.telagent.org/api/v1/session/unlock \
  -H 'Content-Type: application/json' \
  -d '{"passphrase":"<CLAW_PASSPHRASE>"}' | jq -r '.data.sessionToken')

# Unlock session on Node B
TOKEN_B=$(curl -s -X POST https://bess.telagent.org/api/v1/session/unlock \
  -H 'Content-Type: application/json' \
  -d '{"passphrase":"<CLAW_PASSPHRASE>"}' | jq -r '.data.sessionToken')
```

The passphrase is the `CLAW_PASSPHRASE` value from `/opt/clawnet/node.env` on each server (same as `TELAGENT_CLAWNET_PASSPHRASE` in `.env.cloud`).

## Quick Run

From the local repo root:

```bash
cd /Users/xiasenhai/Workspace/OpenClaw/telagent

export TELAGENT_NODE_A_URL="https://alex.telagent.org"
export TELAGENT_NODE_B_URL="https://bess.telagent.org"
export TELAGENT_NODE_A_DOMAIN="alex.telagent.org"
export TELAGENT_NODE_B_DOMAIN="bess.telagent.org"
export TELAGENT_NODE_A_DID="$(curl -fsS https://alex.telagent.org/api/v1/identities/self | jq -r '.data.did')"
export TELAGENT_NODE_B_DID="$(curl -fsS https://bess.telagent.org/api/v1/identities/self | jq -r '.data.did')"

pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts
```

## Report Output

The script generates a JSON report at:
```
docs/implementation/phase-17/cross-node-chat-check-report.json
```

View it:
```bash
jq . docs/implementation/phase-17/cross-node-chat-check-report.json
```

## Pass Criteria

```
checks.nodeAToNodeB.delivered == true
checks.nodeBToNodeA.delivered == true
decision == "PASS"
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TELAGENT_NODE_A_URL` | Node A public HTTPS URL | `https://alex.telagent.org` |
| `TELAGENT_NODE_B_URL` | Node B public HTTPS URL | `https://bess.telagent.org` |
| `TELAGENT_NODE_A_DOMAIN` | Node A domain | `alex.telagent.org` |
| `TELAGENT_NODE_B_DOMAIN` | Node B domain | `bess.telagent.org` |
| `TELAGENT_NODE_A_DID` | Node A DID (auto-fetched via `/identities/self`) | `did:claw:z6tor6X...` |
| `TELAGENT_NODE_B_DID` | Node B DID (auto-fetched via `/identities/self`) | `did:claw:z7Toozk...` |
| `TELAGENT_NODE_A_MAILBOX_KEY_ID` | Node A mailbox key ID (default: `signal-node-a-v1`) | `signal-node-a-v1` |
| `TELAGENT_NODE_B_MAILBOX_KEY_ID` | Node B mailbox key ID (default: `signal-node-b-v1`) | `signal-node-b-v1` |
| `TELAGENT_CROSS_NODE_TIMEOUT_MS` | Delivery wait timeout (default: `30000`) | `30000` |
| `TELAGENT_CROSS_NODE_POLL_INTERVAL_MS` | Poll interval (default: `1000`) | `1000` |

## Pre-flight Health Check

Before running the check, verify both nodes are up:

```bash
# Quick status — these endpoints are whitelisted (no auth required)
curl -fsS https://alex.telagent.org/api/v1/identities/self | jq -r '.data.did'
curl -fsS https://bess.telagent.org/api/v1/identities/self | jq -r '.data.did'

# Node info
curl -fsS https://alex.telagent.org/api/v1/node | jq '.data'
curl -fsS https://bess.telagent.org/api/v1/node | jq '.data'
```

## Troubleshooting

### 401 Unauthorized on `/api/v1/keys/register`, `/messages`, or `/messages/pull`
These endpoints require a valid session token. The script currently does not send `Authorization` headers. Either update the script to include bearer tokens, or verify auto-sessions are active by checking startup logs:
```bash
journalctl -u telagent-node --no-pager -n 20 | grep -i "auto-session"
```

### Script exits without sending messages
- Check that environment variables are all set: `env | grep TELAGENT_NODE`
- Verify DIDs are non-empty (API must be reachable)

### `delivered: false`
- Check P2P transport logs on both nodes: `journalctl -u telagent-node -n 50`
- Check ClawNet connectivity between nodes
- Check outbox delivery retries in logs

### High latency (>5000ms)
- Network connectivity issue between nodes
- ClawNet sync delay — check `journalctl -u clawnetd`

## Script Location

```
packages/node/scripts/run-cross-node-chat-check.ts
```
