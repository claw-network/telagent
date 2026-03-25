---
name: cloud-node-deploy
description: "Deploy or redeploy TelAgent nodes to cloud servers. Handles Node.js upgrade, code sync via git clone, workspace package build, systemd service management, ClawNet daemon, and Caddy reverse proxy. USE FOR: fresh deploy, redeploy after code changes, node upgrade, service restart, health check. UPDATE ALEX AND BESS: update Alex/Bess nodes, upgrade Alex/Bess to new version, redeploy Alex/Bess, restart Alex/Bess. SSH key: ~/.ssh/id_ed25519_clawnet"
---

# Cloud Node Deploy

Deploy or redeploy TelAgent nodes to remote cloud servers.

## Node Inventory

| Node | Domain | IP | DID | User |
|------|--------|----|-----|------|
| Node A | `alex.telagent.org` | `173.249.46.252` | `did:claw:z8MifVfD6GGBeNE4ThZfM3R8tK1daNvrEHWSjRzQuELPA` | root |
| Node B | `bess.telagent.org` | `167.86.93.216` | `did:claw:z4MnGwHRz2TXHfqZFuWNEfwXikMAWdK5yxzerWSf1paWs` | root |

## SSH Access

```bash
SSH_KEY="$HOME/.ssh/id_ed25519_clawnet"
ssh -i "$SSH_KEY" root@<IP>
```

## Preferred Automation

When the local repo is clean and you are ready to publish a version bump, prefer the repo script:

```bash
bash scripts/deploy-node.sh alex
bash scripts/deploy-node.sh bess
bash scripts/deploy-node.sh all
```

This wrapper runs `pnpm run version:patch`, commits and pushes the bump, uploads [scripts/redeploy.sh](/Users/xiasenhai/Workspace/OpenClaw/telagent/scripts/redeploy.sh), and executes it remotely. Use the manual steps below when you need partial control, do not want an automatic version bump, or are debugging a failed deployment.

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

### 4. Install dependencies and build workspace packages

```bash
ssh -i "$SSH_KEY" root@<IP> "cd /opt/telagent && pnpm install --frozen-lockfile"

# Build workspace dependency packages (dist/ is gitignored)
ssh -i "$SSH_KEY" root@<IP> "cd /opt/telagent && pnpm --filter @telagent/protocol build && pnpm --filter @telagent/sdk build"
```

**Important**:
- `package.json` must include `pnpm.onlyBuiltDependencies: ["better-sqlite3"]` to allow native module build scripts.
- The local dev start script now requires `$TELAGENT_HOME/.env` (default: `~/.telagent/.env`). Shell environment variables override file values. On the server, systemd still provides env vars via `EnvironmentFile=/opt/telagent/.env.cloud`, so no package.json patching is needed.
- `@telagent/protocol` and `@telagent/sdk` must be built before starting, as their `dist/` directories are not committed to git.

### 5. Rebuild ClawNet (required after git clone/pull)

ClawNet is a **separate git repository** (`/opt/clawnet`), not part of the telagent monorepo. When ClawNet releases a new version, you must update it separately.

#### 5a. Update ClawNet to new version

```bash
# Fetch and reset to latest version
ssh -i "$SSH_KEY" root@<IP> "cd /opt/clawnet && git fetch origin && git reset --hard origin/main && git log --oneline -3"

# Verify version
ssh -i "$SSH_KEY" root@<IP> "cat /opt/clawnet/packages/node/package.json | grep '\"version\"'"
```

#### 5b. Rebuild ClawNet packages (CRITICAL: build in order)

The `pnpm build` command may fail due to stale `tsconfig.tsbuildinfo` files. Use this exact method:

```bash
# Build in correct order: protocol -> core -> node
ssh -t -i "$SSH_KEY" root@<IP> "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && \
  cd /opt/clawnet/packages/protocol && rm -f tsconfig.tsbuildinfo && rm -rf dist && npx tsc && \
  cd /opt/clawnet/packages/core && rm -f tsconfig.tsbuildinfo && rm -rf dist && npx tsc && \
  cd /opt/clawnet/packages/node && rm -f tsconfig.tsbuildinfo && rm -rf dist && npx tsc"

# Verify daemon.js was built
ssh -i "$SSH_KEY" root@<IP> "sha256sum /opt/clawnet/packages/node/dist/daemon.js"
```

> **Important**: Do NOT use `pnpm build` directly — it parallelizes builds causing dependency resolution failures. Always build in order.

#### 5c. If pnpm-lock.yaml was removed (slow install)

Removing `pnpm-lock.yaml` triggers full dependency resolution (~5-15 min). To avoid this:
```bash
# Only remove lockfile if necessary for version upgrade
# Otherwise, use: rm -rf node_modules/.pnpm/better-sqlite3* && pnpm install
```

### 6. Create ClawNet API key (standalone mode)

When running ClawNet as a standalone daemon (not embedded), TelAgent needs an API key to authenticate with the ClawNet API.

```bash
# Start ClawNet first
ssh -i "$SSH_KEY" root@<IP> "systemctl start clawnetd && sleep 5"

# Create API key
ssh -i "$SSH_KEY" root@<IP> "curl -s -X POST http://127.0.0.1:9528/api/v1/admin/api-keys -H 'Content-Type: application/json' -d '{\"label\":\"telagent\"}'"
# Returns: {"data":{"key":"<api_key>","label":"telagent",...}}

# Add to .env.cloud
ssh -i "$SSH_KEY" root@<IP> "sed -i 's/TELAGENT_CLAWNET_API_KEY=.*/TELAGENT_CLAWNET_API_KEY=<api_key>/' /opt/telagent/.env.cloud"
```

> **Note**: API keys are stored in ClawNet's SQLite DB. If you wipe `/opt/clawnet/node-data`, you must re-create the key and update `.env.cloud`.

### 7. Restart services

```bash
# Restart ClawNet first (telagent-node depends on it)
ssh -t -i "$SSH_KEY" root@<IP> "systemctl restart clawnetd && sleep 5 && systemctl is-active clawnetd"

# Then restart TelAgent
ssh -t -i "$SSH_KEY" root@<IP> "systemctl restart telagent-node && sleep 5 && systemctl is-active telagent-node"
```

### 8. Verify `.env.cloud` configuration

#### 8a. Passphrase

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

#### 8b. Chain config (on-chain DID auto-registration)

The node's DID must be registered on-chain so other nodes can resolve it. At startup, the node calls `batchRegisterDID` automatically — but only if:
1. The `CLAW_CHAIN_*` env vars are configured
2. The node's wallet address has `REGISTRAR_ROLE` on the ClawIdentity contract

On cloud servers (standalone ClawNet node, `TELAGENT_CLAWNET_AUTO_START=false`), the registration uses a direct ethers.js fallback (`registerOnChainDirect`) since there's no embedded managed node.

Verify the required vars are present:

```bash
ssh -i "$SSH_KEY" root@<IP> "grep -E 'CLAW_CHAIN_RPC_URL|CLAW_CHAIN_IDENTITY_CONTRACT|CLAW_CHAIN_ARTIFACTS_DIR|CLAW_SIGNER' /opt/telagent/.env.cloud"
```

If any are missing, add the full chain config block to `.env.cloud`:

```bash
ssh -i "$SSH_KEY" root@<IP> "cat >> /opt/telagent/.env.cloud" << 'EOF'

# ClawNet embedded node chain config (on-chain DID auto-registration)
CLAW_CHAIN_RPC_URL=https://rpc.clawnetd.com
CLAW_CHAIN_ID=7625
CLAW_CHAIN_IDENTITY_CONTRACT=0xee9B2D7eb0CD51e1d0a14278bCA32b02548D1149
# Optional: only needed for ClawNet chain-level features (token/escrow/dao/staking)
# ABIs for these are not bundled in this repo — omit to avoid startup warnings.
# CLAW_CHAIN_TOKEN_CONTRACT=0xE1cf20376ef0372E26CEE715F84A15348bdbB5c6
# CLAW_CHAIN_ESCROW_CONTRACT=0x0e60c5EAf869fBDEbcE5cde4E52ddd195c1F1feD
# CLAW_CHAIN_REPUTATION_CONTRACT=0x9b28722bE8d488b31CF4cAd073De6ad52434b78c
# CLAW_CHAIN_CONTRACTS_CONTRACT=0x7C558284776372A44C906E6f2c38cB83f23966A3
# CLAW_CHAIN_DAO_CONTRACT=0x98f5280ceBEe1eD067A3Cb6729eaAF5ceb3f7Bd9
# CLAW_CHAIN_STAKING_CONTRACT=0x6269D9358a8C4502fC8b629E8998Eb9C98961995
# CLAW_CHAIN_PARAM_REGISTRY_CONTRACT=0x08116e0598Cba600faa7D1f44ef493589B43d3bC
CLAW_SIGNER_TYPE=env
CLAW_SIGNER_ENV=TELAGENT_PRIVATE_KEY
CLAW_CHAIN_ARTIFACTS_DIR=../../packages/contracts/artifacts
EOF
ssh -i "$SSH_KEY" root@<IP> "systemctl restart telagent-node"
```

**Important**:
- `CLAW_CHAIN_ARTIFACTS_DIR=../../packages/contracts/artifacts` is relative to `packages/node/` (i.e. resolves to `/opt/telagent/packages/contracts/artifacts`). This is correct for the standard server layout.
- `CLAW_SIGNER_ENV=TELAGENT_PRIVATE_KEY` reuses the existing private key — no extra key needed.
- The registration is **idempotent**: if the DID is already on-chain, the node skips re-registration.
- On success, the startup log shows: `[info] Identity on-chain registration verified`

### 9. Health check

```bash
# Node info — whitelisted, no auth required
ssh -i "$SSH_KEY" root@<IP> "curl -s http://127.0.0.1:9529/api/v1/node/"

# Or via HTTPS (through Caddy)
curl -fsS https://<domain>/api/v1/node/ | jq '.data'

# Check DID in startup logs
ssh -i "$SSH_KEY" root@<IP> "journalctl -u telagent-node --no-pager -n 15 | grep Identity"

# Verify on-chain DID registration
ssh -i "$SSH_KEY" root@<IP> "journalctl -u telagent-node --no-pager -n 30 | grep -E 'on-chain|ensureRegistered|chain config'"
# Expected: "Identity on-chain registration verified"
# If you see: "identityService unavailable" — CLAW_CHAIN_* env vars are missing (see step 7b)

# Verify auth works — unlock a session (passphrase = CLAW_PASSPHRASE from /opt/clawnet/node.env)
curl -s -X POST https://<domain>/api/v1/session/unlock \
  -H 'Content-Type: application/json' \
  -d '{"passphrase":"<CLAW_PASSPHRASE>"}' | jq -r '.data.sessionToken'
```

> **Auth model**: Most API endpoints require a valid `tses_*` session token via `Authorization: Bearer <token>`. Common unauthenticated exceptions include `/api/v1/node*`, `/api/v1/identities/self`, `POST /api/v1/session/unlock`, and the public profile / attachment routes. WebApp handles the token automatically after the user enters the passphrase on the connect page.

### 10. Update localdev deployment docs

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

## ClawNet 节点
<!-- Table: 版本, PeerId, Network, P2P peers, API port, API key, data dir -->
<!-- 从 curl http://127.0.0.1:9528/api/v1/node 获取 -->
<!-- API key 从 /api/v1/admin/api-keys 创建，写入 .env.cloud 的 TELAGENT_CLAWNET_API_KEY -->

## 服务端口
<!-- Table: TelAgent API (9529), ClawNet API (9528), ClawNet P2P (9527), Geth (8545/30303), Caddy (443) -->

## Systemd 服务
<!-- Table: telagent-node / clawnetd / caddy 状态 -->

## 文件路径
<!-- 服务器关键路径列表 -->

## 部署信息
<!-- Table: 部署方式, Git Remote, TelAgent commit, ClawNet commit, 时间 -->
### 部署步骤
<!-- 部署命令记录 -->
### 注意事项
<!-- env-file patch, workspace build, ClawNet ordered rebuild, DB schema migration -->
```

#### Key lesson: ClawNet must be rebuilt in dependency order after git clone/pull

ClawNet's `packages/node/dist/daemon.js` is a build artifact (gitignored). After `git clone` or `git pull` on `/opt/clawnet`, you must rebuild `protocol -> core -> node` in order so the running daemon matches the checked-out source. A stale daemon can leave you debugging outdated P2P behavior even though the repo is current.

```bash
ssh -t -i "$SSH_KEY" root@<IP> "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && \
  cd /opt/clawnet/packages/protocol && rm -f tsconfig.tsbuildinfo && rm -rf dist && npx tsc && \
  cd /opt/clawnet/packages/core && rm -f tsconfig.tsbuildinfo && rm -rf dist && npx tsc && \
  cd /opt/clawnet/packages/node && rm -f tsconfig.tsbuildinfo && rm -rf dist && npx tsc"
# Verify: sha256sum should match across nodes
ssh -i "$SSH_KEY" root@<IP> "sha256sum /opt/clawnet/packages/node/dist/daemon.js"
```

## Key Configuration Constraints

1. `TELAGENT_CLAWNET_NODE_URL` → `http://127.0.0.1:9528` (local ClawNet)
2. `TELAGENT_CLAWNET_PASSPHRASE` → **required** — must equal `CLAW_PASSPHRASE` from `/opt/clawnet/node.env`; this is the unified auth credential that WebApp users enter to unlock a session
3. `TELAGENT_API_HOST` → `127.0.0.1` (Caddy handles external traffic)
4. Caddy reverse proxies `https://<domain>` → `127.0.0.1:9529`
5. ClawNet listens on port `9528`, TelAgent on port `9529`
6. `CLAW_CHAIN_RPC_URL` + `CLAW_CHAIN_IDENTITY_CONTRACT` + `CLAW_CHAIN_ARTIFACTS_DIR` → **required for on-chain DID registration**. Without these, the node's DID is only local and cannot be resolved by other nodes.
7. `CLAW_SIGNER_ENV=TELAGENT_PRIVATE_KEY` → reuses the TelAgent private key as the chain signer (no extra key needed)
8. Node wallet must have `REGISTRAR_ROLE` on `ClawIdentity` contract (`0xee9B...2b02548D1149`). Deployer address `0xA9b95A4fDCD673f6aE0D2a873E0f4771CA7D0119` can grant this role (key in alex `/opt/clawnet/infra/testnet/prod/secrets.env`)

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

### ClawNet P2P: `aggressive phase complete — 0 peer connection(s)`
Bootstrap failed silently. Common causes:
1. **Stale daemon.js** — Code was updated via `git pull`, but the ordered rebuild from step 5b was not run. Rebuild `protocol -> core -> node`, then restart `clawnetd`.
2. **Stale `config.yaml`** — Old config has `bootstrap: []` or hardcoded peer data. Delete `/opt/clawnet/node-data/config.yaml`, regenerate it with the manual daemon init flow from `ClawNet data wipe (clean restart)`, then start `clawnetd` again. Do not only `systemctl restart`: this service file has `ExecStartPre=/usr/bin/test -f /opt/clawnet/node-data/config.yaml`.
3. **Network mismatch** — Node is on `devnet` but bootstrap server is on `testnet` (or vice versa). Check `network` field in both

Verify binary matches across nodes:
```bash
sha256sum /opt/clawnet/packages/node/dist/daemon.js
```

### ClawNet daemon stuck in `deactivating (stop-sigterm)`
The daemon's graceful shutdown is very slow (30–90s). To force restart:
```bash
systemctl kill -s SIGKILL clawnetd; sleep 2; systemctl start clawnetd
```

### ClawNet data wipe (clean restart)
If config is corrupted or you need a fresh identity:
```bash
systemctl stop clawnetd telagent-node
pkill -9 -f daemon.js 2>/dev/null
rm -rf /opt/clawnet/node-data
mkdir -p /opt/clawnet/node-data
# Init data dir (creates config.yaml + keystore)
cd /opt/clawnet && CLAW_PASSPHRASE=<passphrase> timeout 15 node packages/node/dist/daemon.js --api-host 0.0.0.0 --api-port 9528 --data-dir /opt/clawnet/node-data
# Start service, create API key, update .env.cloud (see steps 6–7)
systemctl start clawnetd
```
> **Warning**: This generates a new DID and PeerId. Update Node Inventory and `.env.cloud` API key.

### WebApp returns 401 on all requests
`TELAGENT_CLAWNET_PASSPHRASE` is missing or empty in `.env.cloud`. Get the value from ClawNet config and add it:
```bash
grep CLAW_PASSPHRASE /opt/clawnet/node.env
echo 'TELAGENT_CLAWNET_PASSPHRASE=<value>' >> /opt/telagent/.env.cloud
systemctl restart telagent-node
```

### DID not registered on-chain (other nodes can't resolve this DID)
Startup log shows `Failed to ensure on-chain identity registration`. Common causes:
1. `CLAW_CHAIN_*` env vars missing from `.env.cloud` → add per step 8b
2. Node wallet lacks `REGISTRAR_ROLE` → log shows `AccessControlUnauthorizedAccount`. Grant the role using the deployer key (see constraint #8)
3. Chain RPC unreachable → check `CLAW_CHAIN_RPC_URL` connectivity

Verify registration after restart:
```bash
journalctl -u telagent-node --no-pager -n 30 | grep -E 'on-chain|ensureRegistered'
# Expected: "Identity on-chain registration verified"
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

### Start script and env-file behavior
Local development now requires `$TELAGENT_HOME/.env` (default: `~/.telagent/.env`). Cloud deployments continue to rely on `EnvironmentFile=/opt/telagent/.env.cloud`, so no package.json start-script patching is required.

## Log Viewing

```bash
# TelAgent logs
journalctl -u telagent-node -f

# ClawNet logs
journalctl -u clawnetd -f

# Caddy logs
journalctl -u caddy -f
```
