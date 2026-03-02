# TelAgent v1 TL 广播模板（给所有 agent）

- 文档版本：v1.0
- 适用对象：Tech Lead / PM
- 目标：统一给所有 agent 下达可执行、可追踪、可验收的任务通知

## 1) Day 1 开工广播（直接可发）

```text
[TelAgent v1 / Day 1 Kickoff]

请先阅读 docs/README.md 指定顺序文档，然后按 docs/implementation/telagent-v1-agent-handoff-day1.md 执行 Day1 任务。

今日任务范围：TA-P0-001 ~ TA-P0-008
角色分配：
- Agent-PO: TA-P0-001, TA-P0-002, TA-P0-003
- Agent-SE: TA-P0-004, TA-P0-006
- Agent-BE: TA-P0-005
- Agent-QA: TA-P0-007
- Agent-TL: TA-P0-008

回报格式（每次同步一致）：
1) Task ID
2) 状态（TODO/IN_PROGRESS/BLOCKED/DONE）
3) 证据链接（文档/PR/测试日志）
4) 阻塞项与下一步

同步节奏：
- 14:00 中途同步
- 18:00 Phase 0 Gate 评审

说明：
- Day2 不自动进入 Phase1，必须以 docs/implementation/gates/phase-0-gate.md 的 Gate 结论为准。
```

## 2) Day 2+ 每日执行广播（直接可发）

```text
[TelAgent v1 / Daily Execution]

先阅读 docs/README.md 指定顺序文档。
然后依据：
- docs/implementation/telagent-v1-iteration-board.md（当周计划）
- docs/implementation/telagent-v1-task-breakdown.md（任务依赖与验收）

执行本周任务：<填当周任务ID范围>
今日重点任务：<填任务ID>
今日 owner：<填角色或姓名>

请按任务 ID 回报状态与证据链接：
- 12:00 前一次进展
- 18:00 前一次进展

若涉及阶段收口，请更新对应 Gate 文档：
docs/implementation/gates/phase-x-gate.md
```

## 3) 阶段切换广播（Gate 通过后）

```text
[TelAgent v1 / Phase Switch]

Gate 结果：
- 阶段：Phase <X>
- 结论：PASS / CONDITIONAL PASS / FAIL
- 记录：docs/implementation/gates/phase-<x>-gate.md

从今天起切换到：
- 新阶段：Phase <Y>
- 任务范围：<填任务ID范围>
- 关键 owner：<填角色或姓名>

如为 CONDITIONAL PASS：
- 补丁项：<填任务ID>
- 截止时间：<填日期时间>
- 未关闭前不得标记阶段完成
```

## 4) 阻塞升级广播（有阻塞时）

```text
[TelAgent v1 / Blocker Escalation]

阻塞任务：<Task ID>
阻塞类型：需求/依赖/环境/权限/测试
影响范围：<影响哪些任务或阶段>
Owner：<角色或姓名>
需要协助：<明确需要谁解决什么>
目标解除时间：<YYYY-MM-DD HH:mm>

规则提醒：
- 阻塞超过 2 小时必须升级
- 任何强约束冲突（/api/v1、DID hash、RFC7807）优先提交 ADR
```

## 5) 统一回报模板（agent 回帖格式）

```text
[Progress Update]
- Task ID: TA-Px-xxx
- Status: TODO/IN_PROGRESS/BLOCKED/DONE
- Evidence: <doc path / PR / test log>
- Risk/Blocker: <none 或具体说明>
- Next Step: <下一步动作>
```

## 6) TL 使用建议

1. 每条广播都带任务 ID，避免“做 XX”这类模糊指令。
2. 每天最多一个主目标，避免多目标导致收敛失败。
3. Gate 前 24 小时先催证据，再开评审会。
4. 若广播内容变更，请同步更新 WBS 与迭代看板，保持单一事实来源。
