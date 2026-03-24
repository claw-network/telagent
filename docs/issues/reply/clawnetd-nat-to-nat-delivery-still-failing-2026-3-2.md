# 回复：NAT-to-NAT 消息投递仍然失败（2026.3.2）— 当前结论与项目现状更新

| 字段 | 值 |
| --- | --- |
| 原始 Issue | `clawnetd-nat-to-nat-delivery-still-failing-2026-3-2.md` |
| 优先级 | **P0** |
| 状态 | **已修复，后续已继续加固** |
| 首个有效修复版本 | **2026.3.5** |
| 当前建议版本 | **2026.3.6** |
| 本次更新日期 | **2026-03-24** |

---

感谢 TelAgent 项目组当时的详细复盘。你们在 2026-03-23 指出的核心判断是对的：

> 仅仅把 `handleDidQuery` / `handleDidResolve` 的读超时从 30s/15s 提高到 60s，只是在缓解症状，并没有解决 NAT-to-NAT relay 路径里的根本阻塞。

结合当前代码、测试和今天的线上升级情况，现结论更新如下：

1. `2026.3.3` 修的是表层症状：更大的 DID query / DID resolve 超时，以及 `peer has NaN total` 日志格式错误。
2. `2026.3.4` 首次处理了真正的死锁根因，但实现仍有“写入失败却返回成功”的误报风险。
3. `2026.3.5` 才是这个 issue 的**首个有效修复版本**：把 direct / relay / attachment / delegated message 这些一跳发送路径改成了**带写入超时的有界等待**。
4. `2026.3.6` 继续加固了剩余 request-response 控制流：给小请求写入增加统一超时，并把 `readStream` 从“绝对总时长超时”改成了“空闲超时”，这样**慢但持续有进展的 relay 流**不会被误判为失败。

---

## 1. 当前项目现状

截至 **2026-03-24**，生产 Bootstrap `api.clawnetd.com` 已升级到 **2026.3.6**。

当前生产节点 `GET /api/v1/node` 返回：

- `version: 2026.3.6`
- `synced: true`
- `network: testnet`
- `peers: 3`
- `connections: 3`

这意味着本文档不再只是停留在 `2026.3.5` 的代码分析，而是已经结合了：

- 当前私有仓库代码
- 当前测试覆盖
- 当前线上 bootstrap 节点状态

---

## 2. 根本原因的重新表述

原始 issue 把问题归因为“circuit relay 很慢，60s 超时仍然不够”，这个方向并不完全错，但它不是完整根因。

更准确地说，问题是三个因素叠加：

### 2.1 一跳消息发送路径使用了无界阻塞写入

旧代码中的 `writeBinaryStream()` 会直接 `await sink(...)`，一直等到远端 drain。

这在 direct message、relay delivery、attachment、delegated message 这类**单向发送**路径里是危险的：

1. 发送方写入后等待 drain
2. 接收方如果因为 relay 太慢而超时关闭流
3. 发送方仍可能卡在 `await sink(...)`
4. 结果就是发送侧挂死，fallback 无法继续

### 2.2 旧的流读取语义更接近“总时长超时”，而不是“空闲超时”

对 slow relay 最重要的不是“总共花了多久”，而是“数据是否持续在前进”。

如果一个 stream 每隔一段时间就收到一点数据，它应该被视为“慢但健康”；  
如果一直没有新数据，才应该触发 timeout。

`2026.3.6` 之前，这一点处理得不够稳，容易把“慢但仍在推进”的 relay 流误判为失败。

### 2.3 控制面 request-response 写入此前没有统一的写入超时

除了 DM / relay payload，本 issue 还暴露出 request-response 控制面的问题：

- `queryPeerDid`
- `fetchPeerDirectory`
- `resolveDidViaPeers`
- `requestDeliveryAuth`
- `requestDeliverableFromPeer`

这些路径虽然本质上是“先写请求，再读响应”，但它们此前的请求写入没有统一的 `write timeout`，因此也可能在慢链路上挂住。

### 2.4 失败可观测性不足

在最初版本里，下面两类失败都不够可观测：

- `resolveDidViaPeers()` 失败时静默返回 `null`
- 没有 connected relay peer 时，只是返回 `false`，没有日志

这会让调用方和排障者都很难分辨问题发生在：

- DID 解析阶段
- relay peer 可用性阶段
- 还是实际写流阶段

---

## 3. 修复时间线

### 3.1 2026.3.3：缓解症状

Commit:

```text
17b3071 fix(node): increase DID resolve/query timeouts to 60s for slow circuit relay
fix(logging): correct peer directory log format string to avoid NaN
```

这一版做了两件对 issue 很直接的事：

- `DID_RESOLVE_TIMEOUT_MS` 提升到 `60_000`
- `DID_QUERY_TIMEOUT_MS` 提升到 `60_000`
- 修掉 `peer directory: no new entries (peer has NaN total...)` 的格式化日志错误

这解释了为什么 issue 里提到的两个表象随后不再是主问题：

- `handleDidResolve` 15s 太短
- `peer has NaN total`

但这一步仍然没有解决**发送端可能无界等待 drain**的问题。

### 3.2 2026.3.4：第一次触及根因

Commit:

```text
89ecf4f fix(node): make fire-and-forget message writes non-blocking to prevent sender deadlock
fix(logging): add warn log when resolveDidViaPeers fails silently
fix(logging): add info log when no relay peers available for delivery
```

这一版的意义是：

- 首次承认“不能继续让 sender 无界阻塞等待 drain”
- 把部分 fire-and-forget 写入改成非阻塞
- 给 DID resolution 失败和 relay peer 不可用补日志

但 `2026.3.4` 还有一个副作用：

> 如果 direct / relay 写入改成“完全不等待”，调用方就可能在写入实际失败时仍然拿到成功返回值。

所以它是重要的过渡修复，但不是最终形态。

### 3.3 2026.3.5：首个有效修复版本

Commit:

```text
f87eec2 fix(node): use writeBinaryStreamWithTimeout for deliverDirect/relay to prevent false positives
```

这一版把关键的一跳发送路径统一改成了 `writeBinaryStreamWithTimeout(...)`：

| 函数 | 当前行为 | 超时 |
| --- | --- | --- |
| `deliverDirect` | 写入成功才返回 `true`，超时/异常返回 `false` | 30s |
| `tryDeliverViaRelay` | 写入成功才返回 `true`，超时/异常继续尝试其他 relay 或返回 `false` | 30s |
| `deliverAttachment` | 写入成功才返回 `true` | 60s |
| `sendDelegatedMsg` | 写入成功才返回 `true` | 30s |

这一版真正修掉了 issue 中最关键的问题：

- 不再无界等待 drain
- 也不再“写失败却当成功”
- fallback / outbox / re-resolve 能拿到可信返回值

所以对 TelAgent 这个 issue 来说，**2026.3.5 是首个有效修复版本**。

### 3.4 2026.3.6：继续加固剩余控制流

Commit:

```text
b776584 fix(node): harden messaging stream timeout handling
```

这一版不是推翻 `2026.3.5`，而是把剩余控制面也补齐：

1. 新增统一小请求写入超时：

```typescript
const REQUEST_WRITE_TIMEOUT_MS = 20_000;
```

2. 下列 request-response 路径改为使用 `writeBinaryStreamWithTimeout(..., REQUEST_WRITE_TIMEOUT_MS)`：

- `queryPeerDid`
- `fetchPeerDirectory`
- `resolveDidViaPeers`
- `requestDeliveryAuth`
- `requestDeliverableFromPeer`

3. `readStream(...)` 改成**按 chunk 重置计时的 idle timeout**。

这意味着：

- 如果 stream 完全停住，会按预期超时
- 如果 stream 很慢但每隔一段时间仍持续有数据，就不会被当成失败

这对 NAT-to-NAT relay 尤其重要，因为 relay 场景的问题通常不是“总时间稍长”，而是“时快时慢、但仍在推进”。

4. 新增测试覆盖：

- `packages/node/test/messaging-streams.test.ts`
  - `resolveDidViaPeers returns null when the request write stalls`
  - `requestDeliverableFromPeer accepts slow streams that keep making progress`

因此，**当前建议版本应提升到 2026.3.6**，而不是停留在 `2026.3.5`。

---

## 4. 当前行为变化

| 场景 | 旧行为（≤2026.3.2） | 当前行为（2026.3.6） |
| --- | --- | --- |
| `deliverDirect` | 可能无界阻塞等待 drain | 写入有 30s 超时，失败返回 `false` |
| `tryDeliverViaRelay` | 可能无界阻塞等待 drain | 每次 relay 写入有 30s 超时，失败记录日志并继续 fallback |
| `deliverAttachment` | 可能无界阻塞 | 写入有 60s 超时 |
| `sendDelegatedMsg` | 可能无界阻塞 | 写入有 30s 超时 |
| `queryPeerDid` / `fetchPeerDirectory` / `resolveDidViaPeers` | 请求写入可能挂住 | 请求写入统一有 20s 超时 |
| `readStream` | 慢链路更容易被整体超时误杀 | 改为空闲超时，慢但持续推进的流可以完成 |
| DID 解析失败 | 可能静默 | 输出 WARN 日志 |
| 无 relay peers | 可能静默返回 `false` | 输出 INFO 日志 |
| peer directory 无新增条目日志 | 可能出现 `NaN total` | 日志格式已修正 |

---

## 5. 仍未改变的架构现实

这个 issue 已经修复，但有两个长期现实并没有因为 `2026.3.5/2026.3.6` 就消失：

### 5.1 circuit relay 仍然只是 fallback 通道，不是高吞吐主通道

它适合 NAT 穿透和兜底，不适合大规模、高带宽、强实时消息传输。

### 5.2 目前仍没有 Store-and-Forward Relay

如果目标 peer 完全离线，消息仍然需要依赖 outbox / 后续重试，而不是由 bootstrap 永久代存。

这意味着“原始 deadlock 已修复”不等于“所有 NAT-to-NAT 投递场景都变成强保证消息系统”。

---

## 6. 与当前生产日志相关的补充说明

今天升级后的生产 Bootstrap 日志里，仍可能看到类似：

```text
[messaging] fetchPeerDirectory attempt 1/3 failed: Protocol selection failed - could not negotiate /clawnet/1.0.0/peer-directory
```

这类日志说明的是：

- 某些 peer 不支持 `peer-directory` 协议
- 或者连接到的是协议能力较旧/不同的 peer

这属于**协议协商 / 兼容性问题**，不是本 issue 中的“sender 因 stream write 无界阻塞而导致 NAT-to-NAT delivery 卡死”的原问题。

换句话说：

- 本 issue 关注的核心死锁/误报链路，已经修复
- 线上仍可能看到一些与 peer capability 协商有关的 WARN/INFO，这需要单独跟踪

---

## 7. TelAgent 当前升级建议

请直接升级到 **2026.3.6**，不要停留在 `2026.3.4` 或 `2026.3.5`。

```bash
npm install @claw-network/node@2026.3.6
# 或
pnpm update @claw-network/node@2026.3.6
```

原因很简单：

- `2026.3.5` 修掉了一跳发送路径的核心死锁与误报
- `2026.3.6` 补齐了控制面 request write timeout，并修正了 slow relay stream 的 timeout 语义

---

## 8. 建议验证方法

### 8.1 先看节点版本

```bash
curl -s https://api.clawnetd.com/api/v1/node | python3 -m json.tool
```

至少确认：

- `version` 为 `2026.3.6`
- `synced` 为 `true`

### 8.2 检查关键日志

```bash
# Bootstrap 端
journalctl -u clawnetd --no-pager | grep "DID resolution failed"
journalctl -u clawnetd --no-pager | grep "no relay peers"
journalctl -u clawnetd --no-pager | grep "direct delivery failed"
journalctl -u clawnetd --no-pager | grep "relay delivery failed"
```

预期：

- 失败场景应该有明确日志，而不是静默失败
- 不应再出现“发送端无限挂住，后续 fallback 不发生”的现象

### 8.3 NAT-to-NAT 测试

1. 启动两个 NAT 节点
2. 节点 A 向节点 B 发消息
3. 观察 direct path 失败后是否出现 re-resolve / relay 尝试 / outbox fallback
4. 重点确认没有长时间卡死在单次 stream write 上

---

## 9. 相关 commits

### 2026.3.6

```text
b776584 fix(node): harden messaging stream timeout handling
```

### 2026.3.5

```text
f87eec2 fix(node): use writeBinaryStreamWithTimeout for deliverDirect/relay to prevent false positives
```

### 2026.3.4

```text
89ecf4f fix(node): make fire-and-forget message writes non-blocking to prevent sender deadlock
fix(logging): add warn log when resolveDidViaPeers fails silently
fix(logging): add info log when no relay peers available for delivery
```

### 2026.3.3

```text
17b3071 fix(node): increase DID resolve/query timeouts to 60s for slow circuit relay
fix(logging): correct peer directory log format string to avoid NaN
```

---

*ClawNet 团队 | 2026-03-24*
