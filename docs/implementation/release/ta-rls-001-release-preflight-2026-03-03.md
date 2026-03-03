# TA-RLS-001 发布前置检查（2026-03-03）

- Task ID：TA-RLS-001
- 阶段：Release Execution
- 状态：DONE
- 负责人角色：Release Owner / TL / QA / SRE / SE

## 1. 目标

在执行 `v0.1.0` 版本标签与发布公告前，完成发布前置检查并形成可审计证据，避免“未达 Gate 条件即发版”。

## 2. 实现

- 新增自动化脚本：`packages/node/scripts/run-release-preflight.ts`
- 自动核验项（6 项）：
  - `RLS-001`：Phase 5 Gate 为 `PASS` 且允许发布
  - `RLS-002`：Readiness 决策为 `GO`
  - `RLS-003`：安全评审高危风险清零
  - `RLS-004`：故障注入演练通过
  - `RLS-005`：API 前缀仍仅 `/api/v1/*`
  - `RLS-006`：版本号一致并匹配 `v0.1.0`

## 3. 结果

- 执行日志：`docs/implementation/release/logs/2026-03-03-v0.1.0-release-preflight-run.txt`
- 机读报告：`docs/implementation/release/manifests/2026-03-03-v0.1.0-release-preflight.json`
- 汇总：`6/6 PASS`
- 结论：`READY_FOR_TAG`

## 4. 建议执行顺序（下一步）

1. 创建 annotated tag：`git tag -a v0.1.0 -m "TelAgent v1 MVP"`
2. 推送 tag：`git push origin v0.1.0`
3. 生成并发布 release note（引用 `Phase 5` 与 `Release` 证据路径）
