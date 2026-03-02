# TelAgent v1 Phase 0 风险清单（Week 1）

- Phase：Phase 0
- 周期：2026-03-02 ~ 2026-03-08
- 最后更新：2026-03-02

| 风险 ID | 风险描述 | 影响范围 | 缓解措施 | Owner | 截止日期 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| RISK-P0-001 | npm registry 不可达（`ENOTFOUND registry.npmjs.org`）导致依赖安装失败 | Day 1 本地基线校验与环境可复现性验证 | 修复网络/DNS 后重跑 `pnpm install && pnpm -r build && pnpm -r test`，日志归档到 `docs/implementation/phase-0/logs/`（提权复验已通过） | Agent-TL / Agent-QA | 2026-03-08 | Closed |
| RISK-P0-002 | Gate 签字仍为角色占位，未实名 | Phase 0 放行合规性 | 在 2026-03-08 Gate 复核会补齐 TL/PO/QA 实名签字并二次校对 | Agent-TL | 2026-03-08 | Open |
| RISK-P0-003 | 远端仓库写入凭据未配置（`git push --dry-run` 失败） | 文档和代码无法及时推送到远端仓库 | 配置 GitHub 认证（PAT 或 `gh auth login`），然后重试 `git push --dry-run` 与 `git push` | Agent-TL | 2026-03-08 | Closed |

## 关闭证据记录

- RISK-P0-001 关闭证据：`docs/implementation/phase-0/logs/2026-03-02-pnpm-install-escalated.log`、`docs/implementation/phase-0/logs/2026-03-02-pnpm-build-escalated.log`、`docs/implementation/phase-0/logs/2026-03-02-pnpm-test-escalated-unrestricted.log`
- RISK-P0-002 关闭证据：`<pending>`
- RISK-P0-003 关闭证据：`docs/implementation/phase-0/logs/2026-03-02-git-push-dry-run.log`、`docs/implementation/phase-0/logs/2026-03-02-git-push-after-closeout.log`
