# TA-P5-004 安全评审与上线检查清单（2026-03-03）

- Task ID：TA-P5-004
- 阶段：Phase 5
- 状态：DONE
- 负责人角色：Security Engineer / Backend Engineer / QA Engineer

## 1. 目标

在 MVP 发布前完成可复现的安全评审，明确：

1. 强约束未被破坏（`/api/v1/*`、`did:claw:*`、DID hash、RFC7807）。
2. 联邦与附件相关核心安全控制保持有效。
3. 高危风险（critical/high）清零，形成可审计证据。

## 2. 实现

### 2.1 自动化安全检查脚本

- 新增脚本：`packages/node/scripts/run-phase5-security-review.ts`
- 输出：`docs/implementation/phase-5/manifests/2026-03-03-p5-security-review.json`
- 覆盖 10 项检查：
  - `SEC-P5-001` API 前缀仅开放 `/api/v1/*`
  - `SEC-P5-002` RFC7807 + `https://telagent.dev/errors/*`
  - `SEC-P5-003` DID 命名空间限制
  - `SEC-P5-004` DID hash 规则校验
  - `SEC-P5-005` 附件大小 50MB 限制
  - `SEC-P5-006` 联邦鉴权 + allowlist
  - `SEC-P5-007` 联邦限流
  - `SEC-P5-008` groupDomain/sourceDomain 一致性
  - `SEC-P5-009` 群生命周期写链 gas 预检与余额断言
  - `SEC-P5-010` 监控告警基线覆盖关键项

### 2.2 安全评审执行证据

- 运行日志：`docs/implementation/phase-5/logs/2026-03-03-p5-security-review-run.txt`
- 机读报告：`docs/implementation/phase-5/manifests/2026-03-03-p5-security-review.json`

## 3. 评审结果

- 检查总数：`10`
- 通过：`10`
- 失败：`0`
- `criticalOpenCount=0`
- `highRiskOpenCount=0`
- 结论：`PASS`（满足“高危风险清零”验收标准）

## 4. 下一步

进入 `TA-P5-005`（发布 Readiness 报告与 Go/No-Go 决策）。
