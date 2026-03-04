# Phase 17 双云节点一键联调命令清单（2026-03-04）

- 适用阶段：Phase 17 (`TA-P17-003`)
- 目标：在两台独立云节点上完成 A->B / B->A 自动联调，并输出机读报告
- 脚本入口：`packages/node/scripts/run-cross-node-chat-check.ts`

## 1. 前置条件

1. 两台云节点都已部署 TelAgent 代码（同一提交版本）。
2. 两台节点可访问同一 ClawNet RPC。
3. 两台节点对外可访问 `api/v1` 接口。
4. 已安装 `jq`、`pnpm`、`node`（建议 Node `>=22 <25`）。

## 2. 模式 A：节点已运行（最快联调）

在本地仓库根目录执行：

```bash
cd /Users/xiasenhai/Workspace/OpenClaw/telagent

export TELAGENT_NODE_A_URL="https://alex.telagent.org"
export TELAGENT_NODE_B_URL="https://bess.telagent.org"

# 必须与各节点 TELAGENT_FEDERATION_SELF_DOMAIN 保持一致
export TELAGENT_NODE_A_DOMAIN="alex.telagent.org"
export TELAGENT_NODE_B_DOMAIN="bess.telagent.org"

# 自动获取 DID
export TELAGENT_NODE_A_DID="$(curl -fsS "${TELAGENT_NODE_A_URL}/api/v1/identities/self" | jq -r '.data.did')"
export TELAGENT_NODE_B_DID="$(curl -fsS "${TELAGENT_NODE_B_URL}/api/v1/identities/self" | jq -r '.data.did')"

# 一键联调
pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts

# 查看报告
jq . docs/implementation/phase-17/cross-node-chat-check-report.json
```

### 2.1 本次实机验证参数（2026-03-04）

| 节点 | 域名 | IP | URL | DID |
| --- | --- | --- | --- | --- |
| Node A | `alex.telagent.org` | `173.249.46.252` | `https://alex.telagent.org` | `did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn` |
| Node B | `bess.telagent.org` | `167.86.93.216` | `https://bess.telagent.org` | `did:claw:z7ToozkCFGsnkJB5HDub6J7cN5EKAxcr4CHfPiazcLkFw` |

## 3. 模式 B：一键下发配置 + 启动节点 + 联调（nohup）

以下脚本会：

- 通过 SSH 下发 `.env.cloud`
- 启动两台节点（`nohup`）
- 执行联调脚本并输出报告

```bash
cat > /tmp/telagent-two-node-smoke.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

# ===== 修改这里 =====
SSH_USER="ubuntu"

NODE_A_HOST="node-a.example.com"
NODE_B_HOST="node-b.example.com"

NODE_A_DOMAIN="node-a.example.com:9529"
NODE_B_DOMAIN="node-b.example.com:9529"

REMOTE_REPO="/opt/telagent"

CHAIN_RPC_URL="https://your-clawnet-rpc"
GROUP_REGISTRY_CONTRACT="0x3333333333333333333333333333333333333333"

PRIVATE_KEY_A="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
PRIVATE_KEY_B="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

FEDERATION_AUTH_TOKEN="replace-with-strong-token"
# =====================

start_remote() {
  local host="$1"
  local self_domain="$2"
  local peer_domain="$3"
  local private_key="$4"

  ssh "${SSH_USER}@${host}" "bash -s" <<SSH_EOF
set -euo pipefail
cd "${REMOTE_REPO}"

corepack enable || true
pnpm install --frozen-lockfile

cat > .env.cloud <<ENV_EOF
TELAGENT_API_HOST=0.0.0.0
TELAGENT_API_PORT=9529
TELAGENT_HOME=/var/lib/telagent

TELAGENT_CHAIN_RPC_URL=${CHAIN_RPC_URL}
TELAGENT_CHAIN_ID=7625
TELAGENT_GROUP_REGISTRY_CONTRACT=${GROUP_REGISTRY_CONTRACT}
TELAGENT_PRIVATE_KEY=${private_key}

TELAGENT_FEDERATION_SELF_DOMAIN=${self_domain}
TELAGENT_FEDERATION_ALLOWED_DOMAINS=${peer_domain}
TELAGENT_FEDERATION_AUTH_TOKEN=${FEDERATION_AUTH_TOKEN}
TELAGENT_FEDERATION_PROTOCOL_VERSION=v1

TELAGENT_CLAWNET_AUTO_DISCOVER=true
TELAGENT_CLAWNET_AUTO_START=true

TELAGENT_LOG_LEVEL=info
ENV_EOF

pkill -f 'tsx src/daemon.ts' || true

set -a
source .env.cloud
set +a

nohup pnpm --filter @telagent/node start > "\$HOME/telagent-node.log" 2>&1 &
sleep 2
SSH_EOF
}

echo "[1/4] start node A"
start_remote "${NODE_A_HOST}" "${NODE_A_DOMAIN}" "${NODE_B_DOMAIN}" "${PRIVATE_KEY_A}"

echo "[2/4] start node B"
start_remote "${NODE_B_HOST}" "${NODE_B_DOMAIN}" "${NODE_A_DOMAIN}" "${PRIVATE_KEY_B}"

NODE_A_URL="https://${NODE_A_DOMAIN}"
NODE_B_URL="https://${NODE_B_DOMAIN}"

echo "[3/4] health check"
curl -fsS "${NODE_A_URL}/api/v1/federation/node-info" >/dev/null
curl -fsS "${NODE_B_URL}/api/v1/federation/node-info" >/dev/null

NODE_A_DID="$(curl -fsS "${NODE_A_URL}/api/v1/identities/self" | jq -r '.data.did')"
NODE_B_DID="$(curl -fsS "${NODE_B_URL}/api/v1/identities/self" | jq -r '.data.did')"

export TELAGENT_NODE_A_URL="${NODE_A_URL}"
export TELAGENT_NODE_B_URL="${NODE_B_URL}"
export TELAGENT_NODE_A_DOMAIN="${NODE_A_DOMAIN}"
export TELAGENT_NODE_B_DOMAIN="${NODE_B_DOMAIN}"
export TELAGENT_NODE_A_DID="${NODE_A_DID}"
export TELAGENT_NODE_B_DID="${NODE_B_DID}"

echo "[4/4] run cross-node chat check"
cd /Users/xiasenhai/Workspace/OpenClaw/telagent
pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts

echo "=== REPORT ==="
jq . /Users/xiasenhai/Workspace/OpenClaw/telagent/docs/implementation/phase-17/cross-node-chat-check-report.json
BASH

chmod +x /tmp/telagent-two-node-smoke.sh
/tmp/telagent-two-node-smoke.sh
```

## 4. 模式 C：systemd（推荐生产/长稳）

### 4.1 远端创建 service 文件

在每台云节点执行（按节点修改 `WorkingDirectory`、`EnvironmentFile`、`User`）：

```bash
sudo tee /etc/systemd/system/telagent-node.service >/dev/null <<'SERVICE_EOF'
[Unit]
Description=TelAgent Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/telagent
EnvironmentFile=/opt/telagent/.env.cloud
ExecStart=/usr/bin/env pnpm --filter @telagent/node start
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SERVICE_EOF
```

### 4.2 启用并启动

```bash
sudo systemctl daemon-reload
sudo systemctl enable telagent-node
sudo systemctl restart telagent-node
sudo systemctl status telagent-node --no-pager
```

### 4.3 查看日志

```bash
sudo journalctl -u telagent-node -f
```

### 4.4 与联调脚本联动

systemd 启动后，回到“模式 A”执行联调脚本即可。

## 5. 通过标准（Gate 可直接引用）

报告文件：`docs/implementation/phase-17/cross-node-chat-check-report.json`

必须同时满足：

- `checks.nodeAToNodeB.delivered == true`
- `checks.nodeBToNodeA.delivered == true`
- `decision == "PASS"`

## 6. 常见失败排查

1. `sourceDomain` 或 `federation self domain` 不一致：
   - 对齐 `TELAGENT_FEDERATION_SELF_DOMAIN` 与脚本中的 `TELAGENT_NODE_*_DOMAIN`。
2. 联邦鉴权失败（401）：
   - 对齐两端 `TELAGENT_FEDERATION_AUTH_TOKEN`。
3. 域名可达但证书失败：
   - 临时改用内网 `http://10.x.x.x:9529` 进行验证，后续补 TLS。
4. 报告超时：
   - 增大 `TELAGENT_CROSS_NODE_TIMEOUT_MS`，并确认两端 `pnpm --filter @telagent/node test` 已通过。
5. Caddy 在 Ubuntu 24.04 默认版本若触发 `tls-alpn-01` 异常：
   - 在 `/etc/caddy/Caddyfile` 的站点块中使用：
     - `tls { issuer acme { disable_tlsalpn_challenge } }`
   - 重新加载后通过 `http-01` 申请证书。
6. `keyId(... ) not found`（通常发生在远端 sequencer 校验 sender key）：
   - 确认联调脚本使用最新版本（已自动在两端预注册 A/B DID 的 signal key）。
