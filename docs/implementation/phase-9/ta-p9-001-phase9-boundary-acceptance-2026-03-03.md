# TA-P9-001 Phase 9 边界与验收标准冻结（2026-03-03）

- Task ID：TA-P9-001
- 阶段：Phase 9（联邦跨域运行手册与灰度兼容）
- 状态：DONE
- 负责人角色：TL / BE / SRE / QA

## 1. 目标

收口 Phase 8 Gate 中 Accepted 风险（跨域节点在线升级时的版本兼容矩阵未覆盖），冻结 Phase 9 的实现边界与验证标准。

## 2. 范围

1. 引入 federation `protocolVersion` 与 `supportedProtocolVersions` 配置。
2. Federation inbound 请求支持协议版本协商：
   - 兼容版本放行；
   - 非兼容版本标准化拒绝（RFC7807）。
3. 在 `node-info` 输出兼容矩阵与计数器（带 hint / 不带 hint / 拒绝次数）。
4. 提供脚本化灰度兼容检查与机读清单（manifest）。

## 3. 验收标准

1. `TA-P9-002`：Node 测试全绿，包含协议兼容测试用例。
2. `TA-P9-003`：脚本 `decision=PASS`，场景通过数 `4/4`。
3. `TA-P9-004`：Gate 文档 `PASS`，WBS 与迭代看板同步更新。

## 4. 实施约束

- API 前缀仍仅允许 `/api/v1/*`。
- 错误响应仍必须 RFC7807（`application/problem+json`）。
- DID 与 hash 规则保持不变（`did:claw:*`, `keccak256(utf8(did))`）。
- 变更只允许向后兼容扩展（旧请求不强制携带协议版本）。

## 5. 下一步

进入 `TA-P9-002`：落地联邦协议版本兼容矩阵与拒绝策略。
