# TA-P5-002 监控面板与告警规则（2026-03-03）

- Task ID：TA-P5-002
- 阶段：Phase 5
- 状态：DONE
- 负责人角色：SRE / Backend Engineer / Frontend Engineer

## 1. 目标

落地可运行的监控与告警能力，满足：

1. 指标可采集（Node 运行指标可被查询）
2. 告警可计算（阈值规则可自动评估）
3. 面板可查看（Web 控制台可展示指标与告警状态）

## 2. 实现

### 2.1 Node 监控服务与 API

- 新增监控服务：`packages/node/src/services/node-monitoring-service.ts`
  - 采集 HTTP 请求总量、状态分布、平均时延、p95 时延
  - 聚合路由级指标（动态 path 规范化，如 `:bytes32`、`:did`）
  - 跟踪 mailbox maintenance 运行与 staleness
  - 内置告警规则评估（`HTTP_5XX_RATE`、`HTTP_P95_LATENCY`、`MAILBOX_MAINTENANCE_STALE`）
- 新增 API：
  - `GET /api/v1/node/metrics`
  - 返回 `data` envelope，包含 `totals/routes/mailboxMaintenance/alerts`
- 路由挂载与请求打点：
  - `packages/node/src/api/server.ts` 在请求完成时自动记录指标
  - `packages/node/src/api/routes/node.ts` 暴露 `metrics` 查询
- 邮箱维护打点：
  - `packages/node/src/app.ts` 在启动与定时维护时记录 cleanup/retraction 指标
- 阈值配置：
  - `packages/node/src/config.ts`
  - `.env.example` 新增 `TELAGENT_MONITOR_*` 配置项

### 2.2 Web 监控面板

- 页面扩展：`packages/web/src/index.html`
  - 新增 Monitoring Dashboard 区块
  - 新增按钮：`GET /api/v1/node/metrics`、自动刷新开关
- 交互逻辑：`packages/web/src/main.js`
  - 渲染指标卡片（requests、5xx rate、p95 latency、mailbox stale）
  - 渲染告警列表（OK/WARN/CRITICAL）
  - 支持 10 秒自动刷新
- 样式：`packages/web/src/styles.css`

### 2.3 测试补齐

- 新增单测：`packages/node/src/services/node-monitoring-service.test.ts`
  - 路由归一化与计数验证
  - 阈值越界触发告警验证
- API 契约测试补充：`packages/node/src/api-contract.test.ts`
  - 覆盖 `GET /api/v1/node/metrics` 可访问

## 3. 产出物

- 监控面板基线：`docs/implementation/phase-5/manifests/2026-03-03-p5-monitoring-dashboard.json`
- 告警规则基线：`docs/implementation/phase-5/manifests/2026-03-03-p5-alert-rules.yaml`

## 4. 验证结果

- Node 构建日志：`docs/implementation/phase-5/logs/2026-03-03-p5-node-build.txt`
- Node 测试日志：`docs/implementation/phase-5/logs/2026-03-03-p5-node-test.txt`
- Web 构建日志：`docs/implementation/phase-5/logs/2026-03-03-p5-web-build.txt`
- 工作区测试日志：`docs/implementation/phase-5/logs/2026-03-03-p5-workspace-test.txt`
- 结论：监控指标、告警规则、面板展示均已可用，满足 TA-P5-002 验收目标。

## 5. 下一步

进入 `TA-P5-003`（故障注入演练：链拥堵/reorg/联邦故障）。
