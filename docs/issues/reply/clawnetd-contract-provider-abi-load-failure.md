# 回复：ClawNet ContractProvider ABI 加载失败时应提供稳定 fallback ABI

| 字段 | 值 |
| --- | --- |
| 原始 Issue | `clawnetd-contract-provider-abi-load-failure.md` |
| 提出方 | TelAgent 项目组 |
| 提出日期 | 2026-03-22 |
| 状态 | **待 ClawNet 团队确认** |

---

感谢 TelAgent 项目组的问题报告。我们已确认此问题并评估了你们提出的三个方案。

## TelAgent 侧修复状态

TelAgent 已在本地创建空的 stub artifact 文件作为临时 workaround：

```bash
packages/contracts/artifacts/contracts/ClawToken.sol/ClawToken.json   # abi: []
packages/contracts/artifacts/contracts/ClawIdentity.sol/ClawIdentity.json  # abi: []
```

这使 `ContractProvider.loadAbi()` 不再抛出 ENOENT，但合约实例无效（abi: []），调用时会报错。这是临时 workaround。

## 方案评估

### 方案 A：内置 fallback ABI

**可接受**，但需要注意：

1. **`ClawIdentity` 最小 ABI 建议**（read-only 函数，足够 TelAgent 日常使用）：
   ```solidity
   function getController(bytes32 didHash) view returns (address)
   function isActive(bytes32 didHash) view returns (bool)
   function selfRegisterDID(bytes32 didHash, bytes publicKey, uint8 purpose)
   function getPublicKey(bytes32 didHash) view returns (bytes)
   ```

2. **`ClawToken` 最小 ABI 建议**（标准 ERC-20）：
   ```solidity
   function balanceOf(address owner) view returns (uint256)
   function decimals() view returns (uint8)
   function symbol() view returns (string)
   function name() view returns (string)
   function totalSupply() view returns (uint256)
   ```

3. **管理员函数（如 `setController`、`mint` 等）** 不需要包含在 fallback ABI 中 — 嵌入式节点通常只需要 read-only 函数。

### 方案 C：`@claw-network/contracts` npm 包

**不支持作为主要方案**，原因：
- artifact JSON 文件较大（每个合约 ~50-100KB）
- 增加了发布和维护负担
- read-only 场景下 full ABI 不必要

## 待确认

1. 方案 A 是否可接受？预计在哪个版本包含？
2. `relayReward` 等可选合约是否也需要 fallback ABI？
3. `artifactsDir` 配置是否可以考虑改为 optional？

---

## 验证方法

修复上线后，请确认以下场景不再出现 `Skipping` 警告：

```bash
# 启动节点后检查日志
grep -i "contractprovider" ~/.telagent/logs/clawnet.log
# 预期：无 "Skipping" 警告

# 确认合约实例可用
curl http://127.0.0.1:9528/api/v1/node | python3 -m json.tool | grep version
# 预期：正常返回版本号
```
