# TA-P2-003 RFC7807 错误链路检查点（2026-03-02）

- Task ID：TA-P2-003
- 阶段：Phase 2
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

实现统一 RFC7807 错误处理链路，保证错误字段完整且 `Content-Type` 正确。

## 2. 实现与修正

- 错误码与 ProblemDetail 映射：`packages/protocol/src/errors.ts`
  - 固定 `type/status/code/title` 映射
- 路由层错误桥接：`packages/node/src/api/route-utils.ts`
  - 所有路由统一通过 `asProblemDetail` 输出
- 响应层修正：`packages/node/src/api/response.ts`
  - `problem()` 现在返回：
    - `Content-Type: application/problem+json; charset=utf-8`

## 3. 验证结果

- 契约测试：`packages/node/src/api-contract.test.ts`
  - `validation errors use RFC7807 shape and problem+json content type`
  - `not found uses RFC7807 shape`
- 日志：`docs/implementation/phase-2/logs/2026-03-02-p2-api-contract-test.txt`
- 结论：错误响应字段 `type/title/status/detail/instance/code` 完整，且头部为 `application/problem+json`。

## 4. 下一步

进入 `TA-P2-004`（IdentityAdapterService）与 `TA-P2-005`（GasService）验证收口。
