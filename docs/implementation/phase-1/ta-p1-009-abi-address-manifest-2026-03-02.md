# TA-P1-009 ABI 与地址清单（2026-03-02）

- Task ID：TA-P1-009
- 阶段：Phase 1
- 状态：IN_PROGRESS
- 负责人角色：Chain Engineer

## 1. 目标

产出下游可直接集成的 ABI 与地址清单（manifest）。

## 2. ABI 产物

- ABI 文件：`docs/implementation/phase-1/manifests/2026-03-02-telagent-group-registry-abi.json`
- 来源 artifact：`packages/contracts/artifacts/contracts/TelagentGroupRegistry.sol/TelagentGroupRegistry.json`

## 3. 地址清单

### 3.1 Local hardhat

- Manifest：`docs/implementation/phase-1/manifests/2026-03-02-local-deploy-manifest.json`
- 关键信息：
  - `proxyAddress`: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
  - `implementationAddress`: `0x5FbDB2315678afecb367f032d93F642f64180aa3`

### 3.2 clawnetTestnet

- 当前状态：未生成（部署阻塞）
- 阻塞证据：`docs/implementation/phase-1/manifests/2026-03-02-testnet-deploy-attempt.txt`

## 4. 当前结论

- ABI 已可供下游集成。
- 地址清单已覆盖 local，testnet 待部署成功后补齐。

## 5. 下一步

1. 解除 `TA-P1-007` 资金阻塞后补齐 testnet manifest。
2. 生成统一 `deploy-manifest`（local + testnet）并转 DONE。
