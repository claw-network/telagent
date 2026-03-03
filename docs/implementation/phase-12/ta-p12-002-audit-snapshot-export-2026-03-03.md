# TA-P12-002 链上/链下审计快照导出（脱敏）（2026-03-03）

- Task ID：TA-P12-002
- 阶段：Phase 12（v1.2 候选能力冻结与排程）
- 状态：DONE
- 负责人角色：Backend + Security

## 1. 目标

落地可审计、可脱敏导出的节点快照能力，覆盖群组、消息、联邦、安全与监控摘要，满足以下验收：

1. 审计快照可通过 `/api/v1/node/audit-snapshot` 导出；
2. 返回体遵循 `{data, links}` envelope；
3. 不暴露敏感明文（域名、controller、envelopeId、conversationId）；
4. 非法查询参数返回 RFC7807 错误。

## 2. 实现范围

### 2.1 MessageService 审计摘要能力

- 更新：`packages/node/src/services/message-service.ts`
- 新增：
  - `MessageAuditSnapshot`
  - `MessageAuditRetractionSample`
  - `buildAuditSnapshot({sampleSize,retractionScanLimit})`
- 行为：
  - 聚合 active/retracted 计数；
  - 对 `envelopeId`、`conversationId` 输出 `sha256` 脱敏哈希；
  - 对 `sampleSize` 与 `retractionScanLimit` 进行边界归一化。

### 2.2 GroupService 查询补齐

- 更新：`packages/node/src/services/group-service.ts`
- 新增：`listGroups(state?)`
- 作用：为节点审计路由提供群组全集与状态统计入口。

### 2.3 Node API 新增审计快照端点

- 更新：`packages/node/src/api/routes/node.ts`
- 新增端点：`GET /api/v1/node/audit-snapshot`
- 查询参数：
  - `sample_size`（默认 20，最大 100）
  - `retraction_scan_limit`（默认 2000，最大 100000）
- 返回摘要：
  - actor：`didHash` + `controllerHash`
  - groups：状态计数、成员计数、域名哈希样本
  - messages：retraction 审计摘要
  - federation：域名哈希、允许源域名哈希、pinning 哈希摘要
  - monitoring：监控 totals/alerts/mailboxMaintenance
- 错误处理：参数非法时走 RFC7807（`application/problem+json`）。

## 3. 测试与校验

### 3.1 单测/契约测试

- 更新：`packages/node/src/services/message-service.test.ts`
  - `TA-P12-002 buildAuditSnapshot exports hashed retraction samples`
  - `TA-P12-002 buildAuditSnapshot normalizes sample and scan bounds`
- 更新：`packages/node/src/api-contract.test.ts`
  - `node audit snapshot exports de-sensitized envelope and links.self`
  - `node audit snapshot rejects invalid query with RFC7807 response`
- 更新：`packages/node/src/api-prefix.test.ts`
  - 覆盖 `/api/v1/node/audit-snapshot` 与 `/v1/node/audit-snapshot` 前缀校验。

### 3.2 Phase 12 专项检查脚本

- 新增：`packages/node/scripts/run-phase12-audit-snapshot-check.ts`
- 校验项：
  1. service 层 retraction 哈希脱敏正确；
  2. API 返回 envelope + self link 正确；
  3. API 响应无明文泄露；
  4. 非法 query 返回 `VALIDATION_ERROR`。
- 产出机读清单：`docs/implementation/phase-12/manifests/2026-03-03-p12-audit-snapshot-check.json`

## 4. 执行命令

```bash
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
pnpm --filter @telagent/node exec tsx scripts/run-phase12-audit-snapshot-check.ts
```

## 5. 证据

- 代码：
  - `packages/node/src/services/group-service.ts`
  - `packages/node/src/services/message-service.ts`
  - `packages/node/src/api/routes/node.ts`
  - `packages/node/src/services/message-service.test.ts`
  - `packages/node/src/api-contract.test.ts`
  - `packages/node/src/api-prefix.test.ts`
  - `packages/node/scripts/run-phase12-audit-snapshot-check.ts`
- 日志：
  - `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-audit-snapshot-check-run.txt`
- 清单：
  - `docs/implementation/phase-12/manifests/2026-03-03-p12-audit-snapshot-check.json`

## 6. 结论

- `TA-P12-002`：PASS
- 审计快照导出能力已落地，满足“可导出审计摘要且不泄露明文”的验收要求。
