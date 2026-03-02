# TA-P0-003 冻结错误码字典与 HTTP 映射

- Task ID：TA-P0-003
- 负责人角色：Protocol Owner
- 状态：DONE
- 冻结日期：2026-03-02

## 1. 错误码总表（Phase 0 冻结）

| code | HTTP | type | title | 适用场景 |
| --- | --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | `https://telagent.dev/errors/validation-error` | Bad Request | 参数格式/约束不满足 |
| `UNAUTHORIZED` | 401 | `https://telagent.dev/errors/unauthorized` | Unauthorized | 未认证或签名无效 |
| `FORBIDDEN` | 403 | `https://telagent.dev/errors/forbidden` | Forbidden | 非 controller/非 owner 的越权操作 |
| `NOT_FOUND` | 404 | `https://telagent.dev/errors/not-found` | Not Found | 资源不存在 |
| `CONFLICT` | 409 | `https://telagent.dev/errors/conflict` | Conflict | 重复邀请、状态冲突 |
| `UNPROCESSABLE_ENTITY` | 422 | `https://telagent.dev/errors/unprocessable-entity` | Unprocessable Entity | 业务可解析但不可执行 |
| `INSUFFICIENT_GAS_TOKEN_BALANCE` | 422 | `https://telagent.dev/errors/insufficient-gas-token-balance` | Unprocessable Entity | gas 余额不足，禁止广播交易 |
| `INTERNAL_ERROR` | 500 | `https://telagent.dev/errors/internal-error` | Internal Server Error | 非预期服务端异常 |

## 2. RFC7807 映射规则

1. `status` 必须与 HTTP 状态码一致。
2. `type` 必须为稳定 URI，不允许使用临时字符串。
3. `code` 必须来自上表，不允许自由扩展。
4. `instance` 必须为当前请求路径，且必须属于 `/api/v1/*`。

## 3. 验收用例最小集

- 输入校验失败 -> `VALIDATION_ERROR`（400）
- DID 无 controller 权限 -> `FORBIDDEN`（403）
- gas 不足 -> `INSUFFICIENT_GAS_TOKEN_BALANCE`（422）
- 资源不存在 -> `NOT_FOUND`（404）

## 4. 证据

- 设计文档错误码域：`docs/design/telagent-v1-design.md`（11.6）
- Envelope 冻结：`docs/implementation/phase-0/ta-p0-002-envelope-freeze.md`
