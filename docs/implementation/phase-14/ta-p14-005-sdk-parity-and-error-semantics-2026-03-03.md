# TA-P14-005 TS/Python SDK 行为收敛与错误语义统一（2026-03-03）

- Task ID：TA-P14-005
- 阶段：Phase 14
- 状态：DONE
- 负责人角色：DX + Backend + QA

## 1. 目标

收敛 TypeScript 与 Python SDK 在核心行为和错误语义上的高优先级差异，确保 direct ACL 新能力上线后，两端 SDK 均能一致处理 `FORBIDDEN + RFC7807`。

## 2. 实现摘要

1. Python SDK 对齐 DID 路径编码语义：
   - `get_identity` 改为 URL 编码 DID path segment（与 TS `encodeURIComponent` 一致）。
2. SDK 错误语义收敛：
   - TS/Python 测试均覆盖 direct ACL 场景下 `403 + application/problem+json + code=FORBIDDEN` 映射。
3. parity 专项校验：
   - 新增 `run-phase14-sdk-parity-check.ts`；
   - 校验方法覆盖、`/api/v1/*` 前缀、错误模型、DID 编码一致性、direct ACL 错误语义一致性。

## 3. 变更文件

- `packages/sdk/src/index.test.ts`
- `packages/sdk-python/telagent_sdk/client.py`
- `packages/sdk-python/tests/test_client.py`
- `packages/node/scripts/run-phase14-sdk-parity-check.ts`

## 4. 验证

1. TS SDK 测试：
   - `corepack pnpm --filter @telagent/sdk test`
2. Python SDK 测试：
   - `python3 -m unittest packages/sdk-python/tests/test_client.py`
3. 专项脚本：
   - `corepack pnpm --filter @telagent/node exec tsx scripts/run-phase14-sdk-parity-check.ts`

## 5. 证据

- TS 测试日志：`docs/implementation/phase-14/logs/2026-03-03-p14-sdk-ts-test.txt`
- Python 测试日志：`docs/implementation/phase-14/logs/2026-03-03-p14-sdk-python-test.txt`
- 专项检查日志：`docs/implementation/phase-14/logs/2026-03-03-p14-sdk-parity-check-run.txt`
- 机读清单：`docs/implementation/phase-14/manifests/2026-03-03-p14-sdk-parity-check.json`
