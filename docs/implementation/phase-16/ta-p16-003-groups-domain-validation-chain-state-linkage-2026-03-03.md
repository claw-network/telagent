# TA-P16-003 群组域增强（链路校验与链状态联动视图）（2026-03-03）

- Task ID：TA-P16-003
- 阶段：Phase 16
- 状态：DONE
- 负责人角色：Frontend + Backend + QA

## 1. 目标

在 Web 群组域补齐工业化可用能力：

1. 建群/邀请/接受三段流程的前端输入校验前置；
2. 群组链状态（`/api/v1/groups/:groupId/chain-state`）与成员视图（`/api/v1/groups/:groupId/members`）联动展示；
3. 群组诊断视图支持成员视图过滤（all/pending/finalized）；
4. 相关逻辑可单测、可专项脚本化校验。

## 2. 实现摘要

1. 新增 `group-domain` 纯逻辑模块：
   - bytes32 校验、成员视图规范化、建群/邀请/接受三类输入校验；
   - 成员状态统计汇总（pending/finalized/removed/unknown）。
2. `api-client` 增强：
   - 新增 `listGroupMembersEnvelope`，保留 `data/meta/links` 分页信息；
   - 现有 `listGroupMembers` 保持向后兼容，继续返回成员数组。
3. 群组页面增强：
   - 流程按钮触发前做字段校验并统一错误反馈；
   - 新增 `Refresh Chain State + Members` 与 `members view` 选择器；
   - 新增 `Group Diagnostics Status` 面板与成员列表视图；
   - create/invite/accept 成功后自动刷新链状态与成员列表。
4. 测试与脚本：
   - 新增 `group-domain.test.js`；
   - 扩展 `api-client.test.js` 覆盖成员分页 envelope；
   - 新增 `run-phase16-groups-domain-check.mjs`。

## 3. 变更文件

- `packages/console/src/core/group-domain.js`
- `packages/console/src/core/api-client.js`
- `packages/console/src/main.js`
- `packages/console/src/styles.css`
- `packages/console/test/group-domain.test.js`
- `packages/console/test/api-client.test.js`
- `packages/console/scripts/run-phase16-groups-domain-check.mjs`

## 4. 验证

1. 构建：
   - `corepack pnpm --filter @telagent/console build`
2. 测试：
   - `corepack pnpm --filter @telagent/console test`
3. 专项脚本：
   - `node packages/console/scripts/run-phase16-groups-domain-check.mjs`

## 5. 证据

- 构建日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-build-ta-p16-003.txt`
- 测试日志：`docs/implementation/phase-16/logs/2026-03-03-p16-console-test-ta-p16-003.txt`
- 专项检查日志：`docs/implementation/phase-16/logs/2026-03-03-p16-groups-domain-check-run.txt`
- 机读清单：`docs/implementation/phase-16/manifests/2026-03-03-p16-groups-domain-check.json`
