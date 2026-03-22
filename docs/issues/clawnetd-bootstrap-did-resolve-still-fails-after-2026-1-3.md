# ClawNet Bootstrap DID Resolve 仍失败（2026.1.3 后复现）

日期: 2026-03-18
报告方: TelAgent 项目组
优先级: P0
关联 Issue:
- clawnetd-bootstrap-did-resolve-and-multi-bootstrap.md
- docs/issues/reply/clawnetd-bootstrap-did-resolve-and-multi-bootstrap.md

---

## 摘要

我们已按 ClawNet 团队回复要求完成升级和重部署：

- bootstrap (clawnetd.com): 2026.1.3
- Alex: 2026.1.3
- Bess: 2026.1.3
- 本地嵌入式 ClawNet: 2026.1.3

但 NAT 本地节点到 Alex/Bess DID 的消息仍然无法投递，仍表现为 peer_unknown。

控制组（本地 -> bootstrap DID）可成功 delivered=true。

结论：问题仍卡在 DID 解析阶段（bootstrap 对目标 DID 未返回可用映射），不是 TelAgent 应用层逻辑错误。

---

## 环境与版本

- 本地 ClawNet API: 127.0.0.1:9528
- 本地 DID: did:claw:zBkpYijx56swvPB65VDb8gUbUVk3nNyPdjdhNaoiyQh93
- bootstrap DID: did:claw:zFy3Ed8bYu5SRHq5YK1YRz58iUpWxL27exCwngDwuH8gR
- Alex DID: did:claw:z8MifVfD6GGBeNE4ThZfM3R8tK1daNvrEHWSjRzQuELPA
- Bess DID: did:claw:z4MnGwHRz2TXHfqZFuWNEfwXikMAWdK5yxzerWSf1paWs

版本确认:

1) bootstrap
- GET https://api.clawnetd.com/api/v1/node -> version=2026.1.3, peers=5

2) Alex
- /opt/clawnet commit: 1424fed
- /opt/telagent commit: 1ecced6
- GET http://127.0.0.1:9528/api/v1/node -> version=2026.1.3, peers=2

3) Bess
- /opt/clawnet commit: 1424fed
- /opt/telagent commit: 1ecced6
- GET http://127.0.0.1:9528/api/v1/node -> version=2026.1.3, peers=2

4) 本地
- GET http://127.0.0.1:9528/api/v1/node -> version=2026.1.3, peers=1

---

## 协议级复现（绕过 TelAgent 业务逻辑）

我们直接调用 ClawNet Messaging API（不是 TelAgent 联系人 API），结果如下：

### Case A: 本地 -> bootstrap DID（控制组）

请求:
- POST /api/v1/messaging/send
- targetDid = did:claw:zFy3Ed8bYu5SRHq5YK1YRz58iUpWxL27exCwngDwuH8gR

结果:
- delivered = true
- messageId = msg_direct_mmvsvxj7

### Case B: 本地 -> Alex DID

请求:
- POST /api/v1/messaging/send
- targetDid = did:claw:z8MifVfD6GGBeNE4ThZfM3R8tK1daNvrEHWSjRzQuELPA

结果:
- delivered = false
- messageId = msg_002e957489b1b57059b58612

本地日志:
- message queued in outbox
- reason = peer_unknown

### Case C: 本地 -> Bess DID

请求:
- POST /api/v1/messaging/send
- targetDid = did:claw:z4MnGwHRz2TXHfqZFuWNEfwXikMAWdK5yxzerWSf1paWs

结果:
- delivered = false
- messageId = msg_0c0c3420e6666f0b5a4c4e2e

本地日志:
- message queued in outbox
- reason = peer_unknown

---

## 关键证据

### 1) 本地 didPeerMap 只有 bootstrap DID

调用:
- GET http://127.0.0.1:9528/api/v1/messaging/peers

结果:
- didPeerMap 仅包含 did:claw:zFy3Ed8b... -> 12D3KooWQnQQ...
- 不包含 Alex DID / Bess DID

### 2) 云节点 didPeerMap 不包含本地 DID

Alex didPeerMap:
- 包含 bootstrap DID
- 包含 Bess DID
- 不包含本地 DID

Bess didPeerMap:
- 包含 bootstrap DID
- 包含 Alex DID
- 不包含本地 DID

### 3) TelAgent 表现与协议级结果一致

本地 TelAgent profile-card 发送时：
- sendProfileCard target=Alex DID
- message queued in outbox
- reason=peer_unknown
- profile 查询返回 data=null

说明应用层只是暴露了底层失败，并非应用层数据处理 bug。

---

## 影响

- WebApp 添加联系人时，昵称和头像无法自动回填
- NAT 本地节点无法通过 bootstrap 解析公网节点 DID
- profile-card 交换不可用，联系人体验严重受损

---

## 需要 ClawNet 团队确认/修复

1) 请给出 2026.1.3 在 bootstrap 上的可验证 DID resolve 证据
- 在 bootstrap 节点抓取 handleDidResolve 命中日志
- 提供针对目标 DID 的 found=true 响应样例（含 peerId/multiaddrs）

2) 请确认 bootstrap 端 did announce 写入路径是否覆盖 NAT 对端
- 本地 did announce 是否被 bootstrap 收到并持久化
- Alex/Bess did announce 是否可被 NAT 节点查询到

3) 若 2026.1.3 仅修复超时机制但未保证 NAT 场景可解析，请给出新版本时间表
- 包含可验证的回归用例（Local NAT -> Alex DID delivered=true）

---

## TelAgent 侧后续计划（并行）

在等待 ClawNet 进一步修复期间，我们将并行评估 HTTP fallback 以恢复联系人资料可用性，避免用户侧功能长期不可用。

---

## 修复进度（2026-03-19）

### 根因确认
ClawNet 2026.1.3 修复了 `readStream()` 超时问题，但 NAT 穿透场景下 DID announce 消息在连接完全建立前被发送，导致 bootstrap 的 `handleDidAnnounce` 读到空数据。

### 修复方案（2026.1.4）
新增 `/clawnet/1.0.0/did-query` 协议 — Bootstrap 主动查询每个连接的 peer 的 DID，而不是被动等待 announce。

### TelAgent 升级操作

1. **依赖升级**：`@claw-network/*` 从 `2026.1.3` 升级到 `2026.1.4`
2. **执行时间**：2026-03-19

```bash
# packages/node/package.json 已更新
"@claw-network/core": "^2026.1.4"
"@claw-network/node": "^2026.1.4"
"@claw-network/sdk": "^2026.1.4"

# 已完成 pnpm install && pnpm -r build
```

### 待验证
重启 Alex/Bess/Local 节点后，执行验证步骤：
```bash
# 1. 确认版本
curl http://127.0.0.1:9528/api/v1/node | grep version
# → "version": "2026.1.4"

# 2. 确认 bootstrap 上的 didPeerMap
curl http://127.0.0.1:9528/api/v1/messaging/peers
# 应包含 bootstrap、Alex、Bess 三个 DID

# 3. 协议级测试
POST /api/v1/messaging/send
targetDid = did:claw:z8MifVfD6GGBeNE4ThZfM3R8tK1daNvrEHWSjRzQuELPA
# 预期 delivered = true
```

## 验证结果（2026-03-20）

### 环境状态
| 节点 | IP | 版本 | 状态 |
|------|----|------|------|
| Bootstrap | api.clawnetd.com | 2026.1.4 | 正常运行，5 peers |
| Alex | 173.249.46.252 | 2026.1.4 | 已升级重启，1 peer |
| Bess | 167.86.93.216 | 2026.1.4 | 已升级重启，1 peer |
| 本地 | 127.0.0.1 | 2026.1.7 | 正常运行，1 peer |

### didPeerMap 状态

| 查询方 | 包含 Bootstrap DID | 包含 Alex DID | 包含 Bess DID | 包含本地 DID |
|--------|-------------------|---------------|---------------|--------------|
| 本地 (127.0.0.1) | ✅ | ❌ | ✅ | N/A |
| Alex (173.249.46.252) | ✅ | N/A | ✅ | ❌ **缺失** |
| Bess (167.86.93.216) | ✅ | ✅ | N/A | ✅ |

### 协议级消息测试

**本地 → Alex DID：**
```json
{
  "delivered": false,
  "messageId": "msg_a4ea2cb485d747a35f525945"
}
```
本地日志：`peer_unknown` — Alex 无法解析本地 DID

**本地 → Bess DID：**
```json
{
  "delivered": false,
  "messageId": "msg_9075e4dbbe36fce0da9b4d7b"
}
```
本地日志：`direct delivery failed: The dial request has no valid addresses` — NAT 穿透失败

### 问题分析

1. **Bess NAT 穿透失败**：`The dial request has no valid addresses` — Circuit Relay v2 未能建立有效中继

2. **Alex DID 解析部分失败**：本地 DID 未出现在 Alex 的 didPeerMap 中，但 Bess 包含本地 DID — DID-query 协议对 Alex 无效

3. **不对称行为**：Bess 能解析到本地 DID，但 Alex 不能，这表明问题可能与 bootstrap 对不同 NAT 节点的分发策略有关

### 结论

**2026.1.4 的 DID-query 修复部分有效但不完整：**
- Bootstrap DID 解析：✅ 正常
- NAT → Bess：DID 解析成功，但实际消息投递失败（NAT 穿透问题）
- NAT → Alex：DID 解析失败，`peer_unknown` 仍然存在

需要 ClawNet 团队进一步调查：
1. 为什么 Alex 无法通过 DID-query 获取本地 DID，而 Bess 可以？
2. NAT 穿透（Circuit Relay v2）在 2026.1.4 中是否实际工作？
