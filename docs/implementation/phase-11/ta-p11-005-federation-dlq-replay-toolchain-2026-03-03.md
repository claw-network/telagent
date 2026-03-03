# TA-P11-005 联邦 DLQ 与重放工具链（2026-03-03）

- Task ID：TA-P11-005
- 阶段：Phase 11（v1.1 安全与运营能力增强）
- 状态：DONE
- 负责人角色：Backend / SRE

## 1. 目标

补齐联邦失败消息的可恢复链路：

1. 入站联邦处理失败时写入 DLQ；
2. 支持按顺序重放 pending 条目；
3. 在 `node-info` 暴露 DLQ 运行指标，便于运维审计。

## 2. 实现

### 2.1 FederationService 增强

- 更新：`packages/node/src/services/federation-service.ts`
- 新增能力：
  - DLQ 结构：`FederationDlqEntry`
  - 写入方法：`recordDlqFailure(scope, payload, meta, error)`
  - 查询方法：`listDlqEntries({status,limit})`
  - 重放方法：`replayDlq({ids,maxItems,stopOnError})`
  - 重放顺序：按 `sequence` 升序执行，保证重放顺序稳定
  - `nodeInfo.dlq` 统计：
    - `pendingCount`
    - `replayedCount`
    - `replaySuccessCount`
    - `replayFailedCount`

### 2.2 Federation API 扩展（仍在 `/api/v1/*`）

- 更新：`packages/node/src/api/routes/federation.ts`
- 新增端点：
  - `GET /api/v1/federation/dlq`
  - `POST /api/v1/federation/dlq/replay`
- 既有端点异常链路接入 DLQ（best effort）：
  - `POST /api/v1/federation/envelopes`
  - `POST /api/v1/federation/group-state/sync`
  - `POST /api/v1/federation/receipts`

### 2.3 测试与脚本

- 更新：`packages/node/src/services/federation-service.test.ts`
  - `TA-P11-005 federation DLQ captures failures and replays in sequence order`
- 更新：`packages/node/src/api-contract.test.ts`
  - 校验 DLQ 列表与 replay 端点可用；
  - 校验失败请求会产生可查询的 DLQ 条目。
- 新增脚本：`packages/node/scripts/run-phase11-federation-dlq-replay-check.ts`
  - 演练“捕获 -> 重放 -> 顺序校验 -> 收敛到 pending=0”闭环；
  - 输出机读清单供 Gate 复核。

## 3. 执行命令

```bash
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
pnpm --filter @telagent/node exec tsx scripts/run-phase11-federation-dlq-replay-check.ts
```

## 4. 证据

- 代码：
  - `packages/node/src/services/federation-service.ts`
  - `packages/node/src/services/federation-service.test.ts`
  - `packages/node/src/api/routes/federation.ts`
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/scripts/run-phase11-federation-dlq-replay-check.ts`
- 日志：
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-federation-dlq-replay-check-run.txt`
- 清单：
  - `docs/implementation/phase-11/manifests/2026-03-03-p11-federation-dlq-replay-check.json`

## 5. 结论

- `TA-P11-005`：PASS
- 联邦失败消息已可进入 DLQ，并可按顺序重放，满足“失败消息可重放且顺序一致”的验收要求。
