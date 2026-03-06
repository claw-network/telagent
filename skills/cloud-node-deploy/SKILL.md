---
name: cloud-node-deploy
description: "Deploy or redeploy TelAgent nodes to cloud servers. Handles Node.js upgrade, code sync via rsync, native module rebuild, systemd service management, ClawNet daemon, and Caddy reverse proxy. USE FOR: fresh deploy, redeploy after code changes, node upgrade, service restart, health check. SSH key: ~/.ssh/id_ed25519_clawnet"
---

# Cloud Node Deploy

Deploy or redeploy TelAgent nodes to remote cloud servers.

## Node Inventory

| Node | Domain | IP | DID | User |
|------|--------|----|-----|------|
| Node A | `alex.telagent.org` | `173.249.46.252` | `did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn` | root |
| Node B | `bess.telagent.org` | `167.86.93.216` | `did:claw:z7ToozkCFGsnkJB5HDub6J7cN5EKAxcr4CHfPiazcLkFw` | root |

## SSH Access

```bash
SSH_KEY="$HOME/.ssh/id_ed25519_clawnet"
ssh -i "$SSH_KEY" root@<IP>
```

## Remote Directory Layout

```
/opt/telagent/              # TelAgent monorepo
  .env.cloud                # TelAgent environment (DO NOT overwrite blindly)
  packages/node/            # @telagent/node package
/opt/clawnet/               # ClawNet monorepo
  node.env                  # ClawNet environment (contains CLAW_PASSPHRASE)
  node-data/                # ClawNet data directory (config.yaml, signer.json, SQLite DBs)
/etc/systemd/system/
  telagent-node.service     # TelAgent systemd unit
  clawnetd.service          # ClawNet systemd unit
/etc/caddy/Caddyfile        # Caddy reverse proxy config
```

## Deployment Steps

### 1. Verify SSH connectivity

```bash
ssh -i "$SSH_KEY" -o ConnectTimeout=10 root@<IP> "hostname && node -v"
```

### 2. Upgrade Node.js (if needed, requires >=22 <25)

```bash
ssh -t -i "$SSH_KEY" root@<IP> "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && node -v && corepack enable && corepack prepare pnpm@10.30.3 --activate"
```

### 3. Sync code via rsync

From the local repo root:

```bash
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env.cloud' \
  --exclude='.env.local' \
  --exclude='.pnpm-store' \
  --exclude='.tmp' \
  --exclude='dist' \
  --exclude='cache' \
  --exclude='artifacts' \
  -e "ssh -i $SSH_KEY" \
  ./ root@<IP>:/opt/telagent/
```

### 4. Install dependencies and rebuild native modules

```bash
ssh -t -i "$SSH_KEY" root@<IP> "cd /opt/telagent && rm -rf node_modules/.pnpm/better-sqlite3* && pnpm install --frozen-lockfile"
```

**Important**: `package.json` must include `pnpm.onlyBuiltDependencies: ["better-sqlite3"]` to allow native module build scripts.

### 5. Rebuild ClawNet native modules (if Node.js was upgraded)

```bash
ssh -t -i "$SSH_KEY" root@<IP> "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && cd /opt/clawnet && rm -rf node_modules/.pnpm/better-sqlite3* && pnpm install"
```

### 6. Restart services

```bash
# Restart ClawNet first (telagent-node depends on it)
ssh -t -i "$SSH_KEY" root@<IP> "systemctl restart clawnetd && sleep 5 && systemctl is-active clawnetd"

# Then restart TelAgent
ssh -t -i "$SSH_KEY" root@<IP> "systemctl restart telagent-node && sleep 5 && systemctl is-active telagent-node"
```

### 7. Health check

```bash
curl -fsS https://<domain>/api/v1/identities/self | jq -r '.data.did'
curl -fsS https://<domain>/api/v1/federation/node-info | jq -r '.data.domain'
```

## Key Configuration Constraints

1. `TELAGENT_CLAWNET_NODE_URL` → `http://127.0.0.1:9528` (local ClawNet)
2. `TELAGENT_FEDERATION_SELF_DOMAIN` → must match the node's domain
3. `TELAGENT_FEDERATION_ALLOWED_DOMAINS` → must list the peer domain
4. `TELAGENT_API_HOST` → `127.0.0.1` (Caddy handles external traffic)
5. Caddy reverse proxies `https://<domain>` → `127.0.0.1:9529`
6. ClawNet listens on port `9528`, TelAgent on port `9529`

## Systemd Service Files

### telagent-node.service

```ini
[Unit]
Description=TelAgent Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/telagent
EnvironmentFile=/opt/telagent/.env.cloud
ExecStart=/usr/bin/env pnpm --filter @telagent/node start
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### clawnetd.service

```ini
[Unit]
Description=ClawNet Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/clawnet
EnvironmentFile=/opt/clawnet/node.env
ExecStartPre=/usr/bin/test -f /opt/clawnet/node-data/config.yaml
ExecStart=/usr/bin/node /opt/clawnet/packages/node/dist/daemon.js --api-host 0.0.0.0 --api-port 9528 --data-dir /opt/clawnet/node-data
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

## Caddyfile Template

```caddyfile
<domain> {
  tls {
    issuer acme {
      disable_tlsalpn_challenge
    }
  }
  encode gzip
  reverse_proxy 127.0.0.1:9529
}
```

## Troubleshooting

### `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION` mismatch
Native module (better-sqlite3) was compiled for a different Node.js version. Fix:
```bash
rm -rf node_modules/.pnpm/better-sqlite3* && pnpm install --frozen-lockfile
```

### `Ignored build scripts: better-sqlite3`
Add to root `package.json`:
```json
"pnpm": { "onlyBuiltDependencies": ["better-sqlite3"] }
```

### `ECONNREFUSED 127.0.0.1:9528`
ClawNet daemon is not running. Restart it:
```bash
systemctl restart clawnetd && journalctl -u clawnetd -n 20
```

### `FATAL: No passphrase configured`
ClawNet requires `CLAW_PASSPHRASE` in `/opt/clawnet/node.env`.

### Corepack interactive prompt blocks SSH
Set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` before the command.

## Log Viewing

```bash
# TelAgent logs
journalctl -u telagent-node -f

# ClawNet logs
journalctl -u clawnetd -f

# Caddy logs
journalctl -u caddy -f
```
