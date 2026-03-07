---
name: cloud-node-deploy
description: "Deploy or redeploy TelAgent nodes to cloud servers. Handles Node.js upgrade, code sync via git clone, workspace package build, systemd service management, ClawNet daemon, and Caddy reverse proxy. USE FOR: fresh deploy, redeploy after code changes, node upgrade, service restart, health check. SSH key: ~/.ssh/id_ed25519_clawnet"
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
  .env.cloud                # TelAgent environment (contains TELAGENT_CLAWNET_PASSPHRASE, DO NOT overwrite blindly)
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

### 3. Deploy code via git clone

```bash
# Backup env, remove old code, clone fresh
ssh -i "$SSH_KEY" root@<IP> "
  cp /opt/telagent/.env.cloud /tmp/.env.cloud.bak
  rm -rf /opt/telagent
  git clone --depth 1 https://github.com/claw-network/telagent.git /opt/telagent
  cp /tmp/.env.cloud.bak /opt/telagent/.env.cloud
"
```

### 4. Install dependencies, patch start script, build workspace packages

```bash
ssh -i "$SSH_KEY" root@<IP> "cd /opt/telagent && pnpm install --frozen-lockfile"

# Remove --env-file flag (only for local dev; server uses systemd EnvironmentFile)
ssh -i "$SSH_KEY" root@<IP> "sed -i 's|tsx --env-file=../../.env src/daemon.ts|tsx src/daemon.ts|' /opt/telagent/packages/node/package.json"

# Build workspace dependency packages (dist/ is gitignored)
ssh -i "$SSH_KEY" root@<IP> "cd /opt/telagent && pnpm --filter @telagent/protocol build && pnpm --filter @telagent/sdk build"
```

**Important**:
- `package.json` must include `pnpm.onlyBuiltDependencies: ["better-sqlite3"]` to allow native module build scripts.
- The `--env-file=../../.env` in `packages/node/package.json` start script is for local dev only. On the server, systemd provides env vars via `EnvironmentFile=/opt/telagent/.env.cloud`, so the flag must be removed.
- `@telagent/protocol` and `@telagent/sdk` must be built before starting, as their `dist/` directories are not committed to git.

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

### 7. Verify passphrase in `.env.cloud`

Ensure `TELAGENT_CLAWNET_PASSPHRASE` is set in `.env.cloud`. This is the unified auth credential — WebApp users must enter this passphrase to unlock a session. Without it, all authenticated API requests will fail with 401.

```bash
ssh -i "$SSH_KEY" root@<IP> "grep TELAGENT_CLAWNET_PASSPHRASE /opt/telagent/.env.cloud"
# Should output: TELAGENT_CLAWNET_PASSPHRASE=<value>

# If missing, get the value from ClawNet config:
ssh -i "$SSH_KEY" root@<IP> "grep CLAW_PASSPHRASE /opt/clawnet/node.env"
# Then add it (use the CLAW_PASSPHRASE value):
ssh -i "$SSH_KEY" root@<IP> "echo 'TELAGENT_CLAWNET_PASSPHRASE=<value_from_above>' >> /opt/telagent/.env.cloud"
ssh -i "$SSH_KEY" root@<IP> "systemctl restart telagent-node"
```

### 8. Health check

```bash
# Node info — whitelisted, no auth required
ssh -i "$SSH_KEY" root@<IP> "curl -s http://127.0.0.1:9529/api/v1/node/"

# Or via HTTPS (through Caddy)
curl -fsS https://<domain>/api/v1/node/ | jq '.data'

# Check DID in startup logs
ssh -i "$SSH_KEY" root@<IP> "journalctl -u telagent-node --no-pager -n 15 | grep Identity"

# Verify auth works — unlock a session (passphrase = CLAW_PASSPHRASE from /opt/clawnet/node.env)
curl -s -X POST https://<domain>/api/v1/session/unlock \
  -H 'Content-Type: application/json' \
  -d '{"passphrase":"<CLAW_PASSPHRASE>"}' | jq '.data.token'
```

> **Auth model**: All API endpoints except `/node/*`, `/identities/self`, and `POST /session/unlock` require a valid `tses_*` session token via `Authorization: Bearer <token>`. WebApp handles this automatically after the user enters the passphrase on the connect page.

### 9. Update localdev deployment docs

After each node is deployed successfully, update the corresponding localdev doc with the latest deployment info:

| Node | File |
|------|------|
| alex | `localdev/node-a-alex.md` |
| bess | `localdev/node-b-bess.md` |

#### Data to collect from the server

```bash
# OS info
ssh -i "$SSH_KEY" root@<IP> "lsb_release -ds && uname -rm"

# Runtime versions
ssh -i "$SSH_KEY" root@<IP> "node -v && pnpm -v"

# DID from startup logs
ssh -i "$SSH_KEY" root@<IP> "journalctl -u telagent-node --no-pager -n 15 | grep Identity"

# Current .env.cloud (contains TELAGENT_PRIVATE_KEY and all env vars)
ssh -i "$SSH_KEY" root@<IP> "cat /opt/telagent/.env.cloud"

# Service status
ssh -i "$SSH_KEY" root@<IP> "systemctl is-active telagent-node clawnetd caddy"

# Deployed commit
ssh -i "$SSH_KEY" root@<IP> "git -C /opt/telagent log --oneline -1"

# Node API info
ssh -i "$SSH_KEY" root@<IP> "curl -s http://127.0.0.1:9529/api/v1/node/"
```

#### Localdev doc structure

Each localdev doc must contain the following sections (in order):

```markdown
# Node X — <domain>

## 访问信息
<!-- Table: 域名, IP, HTTPS URL, SSH 命令, OS, Node.js 版本, pnpm 版本 -->

## DID
<!-- DID string + DID Hash -->

## .env.cloud
<!-- 完整 .env.cloud 内容（从服务器 cat 获取），包含 TELAGENT_PRIVATE_KEY 和 TELAGENT_CLAWNET_PASSPHRASE -->

## 服务端口
<!-- Table: TelAgent API, ClawNet Node, Geth, Caddy 端口 -->

## Systemd 服务
<!-- Table: telagent-node / clawnetd / caddy 状态 -->

## 文件路径
<!-- 服务器关键路径列表 -->

## 部署信息
<!-- Table: 部署方式, Git Remote, commit, 时间 -->
### 部署步骤
<!-- 部署命令记录 -->
### 注意事项
<!-- env-file patch, workspace build, DB schema migration -->
```

## Key Configuration Constraints

1. `TELAGENT_CLAWNET_NODE_URL` → `http://127.0.0.1:9528` (local ClawNet)
2. `TELAGENT_CLAWNET_PASSPHRASE` → **required** — must equal `CLAW_PASSPHRASE` from `/opt/clawnet/node.env`; this is the unified auth credential that WebApp users enter to unlock a session
3. `TELAGENT_API_HOST` → `127.0.0.1` (Caddy handles external traffic)
4. Caddy reverse proxies `https://<domain>` → `127.0.0.1:9529`
5. ClawNet listens on port `9528`, TelAgent on port `9529`

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

### WebApp returns 401 on all requests
`TELAGENT_CLAWNET_PASSPHRASE` is missing or empty in `.env.cloud`. Get the value from ClawNet config and add it:
```bash
grep CLAW_PASSPHRASE /opt/clawnet/node.env
echo 'TELAGENT_CLAWNET_PASSPHRASE=<value>' >> /opt/telagent/.env.cloud
systemctl restart telagent-node
```

### WebApp connect returns 429 Too Many Requests
Too many failed passphrase attempts triggered rate limiting (exponential backoff, 5 failures = 5min lockout per IP). Wait for the lockout to expire, or restart the node to clear in-memory rate limit state:
```bash
systemctl restart telagent-node
```

### Corepack interactive prompt blocks SSH
Set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` before the command.

### `SqliteError: no such column: last_message_at_ms` (or similar schema error)
New code adds columns to SQLite tables, but `CREATE TABLE IF NOT EXISTS` skips existing tables. Fix: backup and remove old DB to let new code recreate it.
```bash
mv /var/lib/telagent/data/mailbox.sqlite /var/lib/telagent/data/mailbox.sqlite.bak
rm -f /var/lib/telagent/data/mailbox.sqlite-shm /var/lib/telagent/data/mailbox.sqlite-wal
systemctl restart telagent-node
```

### `ERR_MODULE_NOT_FOUND` for `@telagent/protocol` or `@telagent/sdk`
Workspace packages need to be compiled. Their `dist/` is gitignored.
```bash
cd /opt/telagent && pnpm --filter @telagent/protocol build && pnpm --filter @telagent/sdk build
```

### `node: ../../.env: not found` (exit code 9)
The start script has `--env-file=../../.env` for local dev. Remove it on the server:
```bash
sed -i 's|tsx --env-file=../../.env src/daemon.ts|tsx src/daemon.ts|' /opt/telagent/packages/node/package.json
```

## Log Viewing

```bash
# TelAgent logs
journalctl -u telagent-node -f

# ClawNet logs
journalctl -u clawnetd -f

# Caddy logs
journalctl -u caddy -f
```
