---
name: cross-node-check
description: "Run cross-node chat delivery check between two TelAgent cloud nodes. Validates bidirectional message delivery (A→B and B→A) and generates a machine-readable PASS/FAIL report. USE FOR: post-deploy validation, federation smoke test, CI/CD gating, cross-node debugging."
---

# Cross-Node Chat Check

Validate bidirectional message delivery between two independent TelAgent cloud nodes.

## Prerequisites

- Both nodes running and reachable via HTTPS
- `jq` and `pnpm` installed locally
- Local repo at the same version as deployed nodes

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
| `TELAGENT_NODE_A_DOMAIN` | Node A federation domain | `alex.telagent.org` |
| `TELAGENT_NODE_B_DOMAIN` | Node B federation domain | `bess.telagent.org` |
| `TELAGENT_NODE_A_DID` | Node A DID (auto-fetched) | `did:claw:z6tor6X...` |
| `TELAGENT_NODE_B_DID` | Node B DID (auto-fetched) | `did:claw:z7Toozk...` |

## Pre-flight Health Check

Before running the check, verify both nodes are up:

```bash
# Quick status
curl -fsS https://alex.telagent.org/api/v1/identities/self | jq -r '.data.did'
curl -fsS https://bess.telagent.org/api/v1/identities/self | jq -r '.data.did'

# Federation info
curl -fsS https://alex.telagent.org/api/v1/federation/node-info | jq -r '.data.domain'
curl -fsS https://bess.telagent.org/api/v1/federation/node-info | jq -r '.data.domain'
```

## Troubleshooting

### Script exits without sending messages
- Check that environment variables are all set: `env | grep TELAGENT_NODE`
- Verify DIDs are non-empty (API must be reachable)

### `delivered: false`
- Check federation logs on both nodes: `journalctl -u telagent-node -n 50`
- Verify `TELAGENT_FEDERATION_ALLOWED_DOMAINS` includes the peer domain
- Verify `TELAGENT_FEDERATION_AUTH_TOKEN` matches between nodes
- Check outbox delivery retries in logs

### High latency (>5000ms)
- Network connectivity issue between nodes
- ClawNet sync delay — check `journalctl -u clawnetd`

## Script Location

```
packages/node/scripts/run-cross-node-chat-check.ts
```
