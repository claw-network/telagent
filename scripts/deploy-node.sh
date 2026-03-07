#!/usr/bin/env bash
set -euo pipefail

HOST="$1"
SSH_KEY="$HOME/.ssh/id_ed25519_clawnet"

echo "=== Deploying to $HOST ==="

ssh -i "$SSH_KEY" "root@$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail

echo "--- Step 1: Stop service, backup env ---"
systemctl stop telagent-node
cp /opt/telagent/.env.cloud /tmp/.env.cloud.bak
echo "Done."

echo "--- Step 2: Fresh clone ---"
rm -rf /opt/telagent
git clone --depth 1 https://github.com/claw-network/telagent.git /opt/telagent
cp /tmp/.env.cloud.bak /opt/telagent/.env.cloud
echo "Done."

echo "--- Step 3: Install deps ---"
cd /opt/telagent
pnpm install --frozen-lockfile 2>&1 | tail -5
echo "Done."

echo "--- Step 4: Fix start script ---"
sed -i 's|tsx --env-file=../../.env src/daemon.ts|tsx src/daemon.ts|' packages/node/package.json
grep '"start"' packages/node/package.json
echo "Done."

echo "--- Step 5: Build workspace deps ---"
pnpm --filter @telagent/protocol build 2>&1 | tail -3
pnpm --filter @telagent/sdk build 2>&1 | tail -3
echo "Done."

echo "--- Step 6: Start service ---"
systemctl start telagent-node
sleep 4
systemctl is-active telagent-node

echo "--- Step 7: Check logs ---"
journalctl -u telagent-node --no-pager -n 30 | grep -iE 'Identity|register|chain|error|listen' || true

echo "=== DEPLOY COMPLETE ==="
REMOTE
