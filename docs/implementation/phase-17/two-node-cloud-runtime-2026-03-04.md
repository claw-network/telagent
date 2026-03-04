# Phase 17 双云节点固定 Runbook（2026-03-04）

- 目的：把当前可用的双节点部署与联调参数固定下来，支持重启后快速复跑
- 适用任务：`TA-P17-003`
- 仓库路径：`/opt/telagent`

## 1) 节点清单

| 节点 | 域名 | IP | DID | 进程 |
| --- | --- | --- | --- | --- |
| Node A | `alex.telagent.org` | `173.249.46.252` | `did:claw:z6tor6XFy7EYf6GJrqknsgjvEHZxoZbC1KQQkLBvmNyXn` | `telagent-node.service`, `caddy.service` |
| Node B | `bess.telagent.org` | `167.86.93.216` | `did:claw:z7ToozkCFGsnkJB5HDub6J7cN5EKAxcr4CHfPiazcLkFw` | `telagent-node.service`, `caddy.service` |

## 2) 远端配置文件

- TelAgent 环境文件：`/opt/telagent/.env.cloud`
- TelAgent 服务：`/etc/systemd/system/telagent-node.service`
- Caddy 配置：`/etc/caddy/Caddyfile`

## 3) 关键配置约束

1. `TELAGENT_CLAWNET_NODE_URL` 固定为本机 `http://127.0.0.1:9528`
2. `TELAGENT_FEDERATION_SELF_DOMAIN` 必须分别为 `alex.telagent.org` / `bess.telagent.org`
3. `TELAGENT_FEDERATION_ALLOWED_DOMAINS` 必须互相指向对端域名
4. Caddy 站点必须反向代理到 `127.0.0.1:9529`
5. Caddy ACME 建议禁用 `tls-alpn` 挑战并使用 `http-01`：

```caddyfile
tls {
  issuer acme {
    disable_tlsalpn_challenge
  }
}
```

## 4) 服务巡检

在任意节点执行：

```bash
systemctl is-active telagent-node caddy
curl -fsS https://<domain>/api/v1/identities/self | jq -r '.data.did'
curl -fsS https://<domain>/api/v1/federation/node-info | jq -r '.data.domain'
```

## 5) 复跑联调（控制机）

```bash
cd /Users/xiasenhai/Workspace/OpenClaw/telagent

export TELAGENT_NODE_A_URL="https://alex.telagent.org"
export TELAGENT_NODE_B_URL="https://bess.telagent.org"
export TELAGENT_NODE_A_DOMAIN="alex.telagent.org"
export TELAGENT_NODE_B_DOMAIN="bess.telagent.org"
export TELAGENT_NODE_A_DID="$(curl -fsS https://alex.telagent.org/api/v1/identities/self | jq -r '.data.did')"
export TELAGENT_NODE_B_DID="$(curl -fsS https://bess.telagent.org/api/v1/identities/self | jq -r '.data.did')"

pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts
jq . docs/implementation/phase-17/cross-node-chat-check-report.json
```

## 6) 通过标准

- `checks.nodeAToNodeB.delivered == true`
- `checks.nodeBToNodeA.delivered == true`
- `decision == "PASS"`
