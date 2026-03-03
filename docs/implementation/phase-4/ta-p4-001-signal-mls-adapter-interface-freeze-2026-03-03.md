# TA-P4-001 Signal/MLS 适配层接口冻结（2026-03-03）

- Task ID：TA-P4-001
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：Protocol Owner / Backend Engineer

## 1. 目标

冻结协议层加密适配接口，保证后续可无缝接入生产级 Signal/MLS 引擎。

## 2. 实现

- 新增协议接口文件：`packages/protocol/src/crypto-adapters.ts`
- 暴露接口：
  - `SignalAdapter`（`seal/open`）
  - `MlsAdapter`（`seal/open`）
- 补充请求/响应结构：
  - `SignalSealRequest` / `SignalOpenRequest`
  - `MlsSealRequest` / `MlsOpenRequest`
  - `AdapterEnvelopePayload` / `AdapterPlaintextPayload`
- 导出更新：`packages/protocol/src/index.ts`
- 协议说明更新：`packages/protocol/README.md`

## 3. 验证结果

- 协议层构建：`docs/implementation/phase-4/logs/2026-03-03-p4-node-build.txt`
- 全仓测试：`docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt`
- 结论：接口冻结完成，未破坏现有 API/类型兼容。

## 4. 下一步

推进 `TA-P4-002`（seq 分配器）与 `TA-P4-003`（幂等去重写入）。
