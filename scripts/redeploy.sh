#!/usr/bin/env bash
# =============================================================================
# TelAgent Node Remote Redeploy Script
# 运行在服务器上，一键完成全量重新部署。
# 用法: bash /opt/redeploy.sh
# =============================================================================
set -euo pipefail

REPO="https://github.com/claw-network/telagent.git"
DEPLOY_DIR="/opt/telagent"
ENV_BAK="/tmp/.env.cloud.bak"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo "[$(date '+%H:%M:%S')] ✓ $*"; }
fail() { echo "[$(date '+%H:%M:%S')] ✗ $*" >&2; exit 1; }

# ── Step 1: Backup env ────────────────────────────────────────────────────────
log "Step 1: Backup .env.cloud"
[[ -f "$DEPLOY_DIR/.env.cloud" ]] || fail ".env.cloud not found at $DEPLOY_DIR"
cp "$DEPLOY_DIR/.env.cloud" "$ENV_BAK"
ok "Backed up to $ENV_BAK"

# ── Step 2: Fresh clone ───────────────────────────────────────────────────────
log "Step 2: Fresh clone from $REPO"
rm -rf "$DEPLOY_DIR"
git clone --depth 1 "$REPO" "$DEPLOY_DIR"
cp "$ENV_BAK" "$DEPLOY_DIR/.env.cloud"
COMMIT=$(cd "$DEPLOY_DIR" && git log --oneline -1)
ok "Cloned: $COMMIT"

# ── Step 3: Install dependencies ─────────────────────────────────────────────
log "Step 3: pnpm install"
cd "$DEPLOY_DIR"
pnpm install --frozen-lockfile 2>&1 | tail -3
ok "Dependencies installed"

# ── Step 4: Patch start script ───────────────────────────────────────────────
log "Step 4: Patch start script (remove --env-file flag)"
sed -i 's|tsx --env-file=../../.env src/daemon.ts|tsx src/daemon.ts|' \
    packages/node/package.json
ok "Start script patched"

# ── Step 5: Build workspace packages ─────────────────────────────────────────
log "Step 5: Build @telagent/protocol"
pnpm --filter @telagent/protocol build 2>&1 | tail -3
log "Step 5: Build @telagent/sdk"
pnpm --filter @telagent/sdk build 2>&1 | tail -3
ok "Packages built"

# ── Step 6: Restart clawnetd ─────────────────────────────────────────────────
log "Step 6: Restart clawnetd"
systemctl restart clawnetd || true

# Wait up to 30s for it to leave deactivating state
for i in $(seq 1 6); do
    STATE=$(systemctl is-active clawnetd 2>/dev/null || true)
    if [[ "$STATE" == "active" ]]; then
        ok "clawnetd is active"
        break
    fi
    log "  clawnetd state=$STATE, waiting... ($i/6)"
    sleep 5
done

# If still not active, force kill aux processes and start fresh
STATE=$(systemctl is-active clawnetd 2>/dev/null || true)
if [[ "$STATE" != "active" ]]; then
    log "  Force-killing clawnetd and restarting..."
    systemctl kill -s SIGKILL clawnetd 2>/dev/null || true
    sleep 2
    systemctl reset-failed clawnetd 2>/dev/null || true
    systemctl start clawnetd
    sleep 5
    STATE=$(systemctl is-active clawnetd 2>/dev/null || true)
    [[ "$STATE" == "active" ]] || fail "clawnetd failed to start (state=$STATE)"
    ok "clawnetd is active (after force restart)"
fi

# ── Step 7: Restart telagent-node ────────────────────────────────────────────
log "Step 7: Restart telagent-node"
systemctl restart telagent-node
sleep 5
STATE=$(systemctl is-active telagent-node 2>/dev/null || true)
[[ "$STATE" == "active" ]] || fail "telagent-node failed to start (state=$STATE)"
ok "telagent-node is active"

# ── Step 8: Quick health check ───────────────────────────────────────────────
log "Step 8: Health check"
RESP=$(curl -s --max-time 5 http://127.0.0.1:9529/api/v1/node/ || true)
if echo "$RESP" | grep -q '"service":"telagent-node"'; then
    ok "API responding: $RESP"
else
    log "  API not yet ready (may still be starting): $RESP"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  DEPLOY COMPLETE"
echo "  Commit: $COMMIT"
echo "  clawnetd:      $(systemctl is-active clawnetd)"
echo "  telagent-node: $(systemctl is-active telagent-node)"
echo "============================================"
