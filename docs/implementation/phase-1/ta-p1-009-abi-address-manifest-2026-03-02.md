# TA-P1-009 ABI 与地址清单（2026-03-02）

- Task ID：TA-P1-009
- 阶段：Phase 1
- 状态：DONE
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

- Manifest：`docs/implementation/phase-1/manifests/2026-03-02-testnet-deploy-manifest.json`
- 关键信息：
  - `proxyAddress`: `0x30AF4A124e41da5551EBfA41904eaF676FC8fbB0`
  - `implementationAddress`: `0x8a0DF8503202828A7808C3cA2E0753ecb91A28C3`
  - `deployer`: `0xA9b95A4fDCD673f6aE0D2a873E0f4771CA7D0119`

### 3.3 统一地址清单（local + testnet）

- 汇总清单：`docs/implementation/phase-1/manifests/2026-03-02-deploy-manifest.json`
- 用途：下游按 `deployments.<networkName>` 直接读取 proxy 与 implementation 地址。

## 4. 当前结论

- ABI 已可供下游集成。
- 地址清单已覆盖 local + testnet，`TA-P1-009` 关闭。

## 5. 下一步

1. 若执行 `TA-P1-010`（可选），复用本清单中的 testnet 地址进行 Router 注册。
2. 进入 `TA-P1-011` Gate 评审。
