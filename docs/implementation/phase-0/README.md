# TelAgent v1 Phase 0 规范冻结产出

- 文档版本：v1.0
- 状态：冻结中（Day 1）
- 最后更新：2026-03-02

## 1. 产出目录（TA-P0-001 ~ TA-P0-008）

| Task ID | 文档 | 说明 |
| --- | --- | --- |
| TA-P0-001 | `ta-p0-001-api-path-freeze.md` | API 路径策略冻结（仅 `/api/v1/*`） |
| TA-P0-002 | `ta-p0-002-envelope-freeze.md` | 成功/错误 envelope 冻结 |
| TA-P0-003 | `ta-p0-003-error-code-dictionary.md` | 错误码字典与 HTTP 映射 |
| TA-P0-004 | `ta-p0-004-did-auth-rfc.md` | DID hash + controller 鉴权 RFC |
| TA-P0-005 | `ta-p0-005-group-state-machine-rfc.md` | 群与成员状态机 RFC |
| TA-P0-006 | `ta-p0-006-domain-proof-v1-spec.md` | DomainProofV1 规范 |
| TA-P0-007 | `ta-p0-007-test-strategy.md` | 合约/API/集成/E2E 测试策略 |
| TA-P0-008 | `ta-p0-008-gate-mechanism.md` | Gate 机制与风险模板落地说明 |

补充证据：

- `day1-baseline-check.md`：Day 1 本地基线校验日志（install/build/test）

## 2. 强约束复核

1. API 前缀仅允许 `/api/v1/*`。
2. DID 仅允许 `did:claw:*`。
3. DID hash 固定 `keccak256(utf8(did))`。
4. 错误响应必须符合 RFC7807。
5. Gate 未通过前不允许进入下一阶段。

## 3. Gate 记录落点

- 评审记录：`docs/implementation/gates/phase-0-gate.md`
- 模板：`docs/implementation/gates/phase-gate-template.md`
- 风险清单模板：`docs/implementation/gates/risk-register-template.md`
