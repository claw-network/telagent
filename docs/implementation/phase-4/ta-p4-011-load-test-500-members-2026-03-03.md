# TA-P4-011 压测（<=500 成员群）（2026-03-03）

- Task ID：TA-P4-011
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：SRE / QA / Backend Engineer

## 1. 目标

在消息通道 Phase 4C 收口前，对 `<=500` 成员群进行容量与稳定性验证，确认至少一次投递、会话内有序与去重能力在目标规模下可达成。

## 2. 实现

- 新增压测脚本：`packages/node/scripts/run-phase4-load-test.ts`
  - 使用 500 成员、每成员 4 条消息（共 2000 条）进行群聊消息写入压测。
  - 执行 200 次 `envelopeId` 重放，验证幂等去重命中率。
  - 分页拉取（`limit=200`）并校验顺序稳定性和无重复。
  - 输出结构化报告（JSON）并按阈值自动判定 PASS/FAIL。
- 产出清单：
  - 压测日志：`docs/implementation/phase-4/logs/2026-03-03-p4-load-test-run.txt`
  - 压测报告：`docs/implementation/phase-4/manifests/2026-03-03-p4-load-test.json`

## 3. 阈值与结果

- 压测配置：
  - 成员数：`500`
  - 消息量：`2000`（每成员 4 条）
  - 去重回放：`200`
- 核心结果（摘录）：
  - 发送吞吐：`14125.33 msg/s`
  - 发送延迟：`p95=0.096 ms`（阈值 `<=20 ms`）
  - 拉取延迟：`p95=0.297 ms`（阈值 `<=100 ms`）
  - 去重命中率：`100%`
  - 顺序违规：`0`
  - 重复 envelope：`0`
- 结论：`evaluation.passed=true`，满足 TA-P4-011 验收口径。

## 4. 回归验证

- Node 构建：`docs/implementation/phase-4/logs/2026-03-03-p4-node-build.txt`
- Node 测试：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`（`28/28`）
- 工作区测试：`docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt`

## 5. 下一步

进入 `TA-P4-012`（Phase 4 Gate 评审与阶段关闭）。
