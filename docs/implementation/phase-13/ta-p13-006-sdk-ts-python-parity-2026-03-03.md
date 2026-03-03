# TA-P13-006 SDK TS/Python 一致性校验（2026-03-03）

- Task ID：TA-P13-006
- 阶段：Phase 13
- 状态：DONE
- 负责人角色：DX + Backend + QA

## 1. 目标

校验 TypeScript 与 Python SDK 在核心主路径能力上的一致性，确保双语言接入行为可预期。

## 2. 实现

- 新增脚本：`packages/node/scripts/run-phase13-sdk-parity-check.ts`
- 对齐维度：
  1. 核心方法矩阵（identity/group/message/pull）；
  2. `/api/v1/*` 前缀一致性；
  3. RFC7807 错误模型处理一致性；
  4. `conversation_id` 拉取参数一致。

## 3. 结果

- `coreMethodParityPass=true`
- `apiPrefixParityPass=true`
- `errorModelParityPass=true`
- `pullConversationQueryParityPass=true`
- 结论：`PASS`

## 4. 证据

- 脚本：`packages/node/scripts/run-phase13-sdk-parity-check.ts`
- 比对对象：
  - `packages/sdk/src/index.ts`
  - `packages/sdk-python/telagent_sdk/client.py`
- 日志：`docs/implementation/phase-13/logs/2026-03-03-p13-sdk-parity-check-run.txt`
- 清单：`docs/implementation/phase-13/manifests/2026-03-03-p13-sdk-parity-check.json`

## 5. 结论

- `TA-P13-006`：PASS
- TS/Python SDK 核心能力与错误模型已达成一致性基线。
