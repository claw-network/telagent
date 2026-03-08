#!/usr/bin/env bash
# =============================================================================
# TelAgent Node Deploy — 本地执行脚本
# 将 redeploy.sh 上传到服务器并一键运行。
#
# 用法:
#   bash scripts/deploy-node.sh <IP或hostname>
#   bash scripts/deploy-node.sh alex          # 173.249.46.252
#   bash scripts/deploy-node.sh bess          # 167.86.93.216
#   bash scripts/deploy-node.sh all           # 依次部署两个节点
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="$HOME/.ssh/id_ed25519_clawnet"
SSH_OPTS="-i $SSH_KEY -o ConnectTimeout=15 -o BatchMode=yes"

# Node name → IP map
declare -A NODE_IPS=(
    [alex]="173.249.46.252"
    [bess]="167.86.93.216"
)

deploy_one() {
    local target="$1"
    # Resolve name to IP if needed
    local host="${NODE_IPS[$target]:-$target}"

    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "  Deploying to: $target ($host)"
    echo "╚══════════════════════════════════════════════════════╝"

    # Upload redeploy.sh
    echo "[local] Uploading redeploy.sh → root@$host:/opt/redeploy.sh"
    scp $SSH_OPTS "$SCRIPT_DIR/redeploy.sh" "root@$host:/opt/redeploy.sh"

    # Execute
    echo "[local] Running redeploy.sh on $host..."
    ssh $SSH_OPTS "root@$host" 'bash /opt/redeploy.sh'
}

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <alex|bess|all|IP>"
    exit 1
fi

case "$1" in
    all)
        deploy_one alex
        deploy_one bess
        ;;
    *)
        deploy_one "$1"
        ;;
esac
