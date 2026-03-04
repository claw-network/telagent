# TA-P12-006 Console v2.1 运营与应急面板（2026-03-03）

- Task ID：TA-P12-006
- 阶段：Phase 12（v1.2 候选能力冻结与排程）
- 状态：DONE
- 负责人角色：Frontend + SRE

## 1. 目标

在现有 Mission Console v2 基础上升级 v2.1 运营与应急能力，满足以下验收：

1. 审计快照可直接在控制台拉取并可视化；
2. 支持 DLQ 批量重放（手工选择 IDs + 参数化执行）；
3. 提供面向运营的风险看板（监控告警 + 审计信号聚合）；
4. 具备脚本化校验与机读清单。

## 2. 实现范围

### 2.1 Console v2.1 面板升级

- 更新：
  - `packages/console/src/index.html`
  - `packages/console/src/main.js`
  - `packages/console/src/styles.css`
- 新增能力：
  - `Audit & Emergency Panel v2.1`
  - `GET /api/v1/node/audit-snapshot` 参数化拉取（`sample_size` / `retraction_scan_limit`）
  - 风险看板（`risk-board-list`）按风险等级展示
  - DLQ 批量重放：
    - 选择 pending 条目填充 IDs
    - 支持 `maxItems` 与 `stopOnError`
    - 调用 `POST /api/v1/federation/dlq/replay`（携带 `ids`）

### 2.2 指标/风险联动

- 在监控卡片新增 `DLQ Burn Rate` 指标展示；
- 风险聚合来源：
  - `/api/v1/node/metrics` 告警（WARN/CRITICAL）
  - `/api/v1/node/audit-snapshot` isolation/group/federation 信号
  - federation DLQ pending backlog

### 2.3 专项检查脚本

- 新增：`packages/console/scripts/run-phase12-console-v21-check.mjs`
- 校验项：
  1. HTML 存在 v2.1 审计/应急面板及关键控件；
  2. JS 存在审计快照、风险看板、批量重放逻辑；
  3. CSS 存在风险看板与应急输入样式。
- 产出机读清单：
  - `docs/implementation/phase-12/manifests/2026-03-03-p12-console-v21-check.json`

## 3. 执行命令

```bash
corepack pnpm --filter @telagent/console build
corepack pnpm --filter @telagent/console test
corepack pnpm --filter @telagent/console exec node scripts/run-phase12-console-v21-check.mjs
```

## 4. 证据

- 代码：
  - `packages/console/src/index.html`
  - `packages/console/src/main.js`
  - `packages/console/src/styles.css`
  - `packages/console/scripts/run-phase12-console-v21-check.mjs`
- 日志：
  - `docs/implementation/phase-12/logs/2026-03-03-p12-console-build.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-console-test.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-console-v21-check-run.txt`
- 清单：
  - `docs/implementation/phase-12/manifests/2026-03-03-p12-console-v21-check.json`

## 5. 结论

- `TA-P12-006`：PASS
- Console v2.1 已具备审计快照、DLQ 批量重放与风险看板，满足本任务验收目标。
