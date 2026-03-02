# TelAgent v1 Agent 接力启动清单（Day 1）

- 文档版本：v1.0
- 启动日期基线：2026-03-02（周一）
- 目标：让新加入的 agent 在不口头沟通的情况下，1 天内进入稳定执行状态

## 1. 启动前 15 分钟（必须完成）

1. 按固定顺序阅读文档：
   - `docs/design/telagent-v1-design.md`
   - `docs/implementation/telagent-v1-implementation-plan.md`
   - `docs/implementation/telagent-v1-task-breakdown.md`
   - `docs/implementation/telagent-v1-iteration-board.md`
2. 确认强约束：
   - API 仅允许 `/api/v1/*`
   - DID 仅 `did:claw:*`
   - DID 哈希规则 `keccak256(utf8(did))`
   - 错误响应必须 RFC7807
3. 本地基础校验：
   - `pnpm install`
   - `pnpm -r build`
   - `pnpm -r test`

## 2. 角色分工（Day 1 建议）

- Agent-PO（协议/规范）：负责 Phase 0 的规范冻结类任务。
- Agent-SE（安全/鉴权）：负责 DID 鉴权规则、DomainProofV1。
- Agent-BE（后端/状态机）：负责状态机 RFC 与实现约束对齐。
- Agent-QA（测试策略）：负责测试金字塔与 Gate 检查清单。
- Agent-TL（主持/Gate）：负责汇总评审与风险登记。

> 如果人数不足，可让 Agent-BE 兼任 Agent-QA；但 Agent-TL 不建议兼任实现角色。

## 3. Day 1 任务分派（直接执行）

## 3.1 Agent-PO

- 执行任务：`TA-P0-001` `TA-P0-002` `TA-P0-003`
- 当日输出：
  - API 路径冻结记录
  - success/error envelope 冻结记录
  - 错误码映射冻结记录
- 完成标准：三项任务在 WBS 中从 `TODO` 更新为 `DONE`，并附文档证据链接。

## 3.2 Agent-SE

- 执行任务：`TA-P0-004` `TA-P0-006`
- 当日输出：
  - DID/controller 鉴权规则核对单（与 ClawNet 对齐）
  - DomainProofV1 校验规则（字段、过期、域名一致性）
- 完成标准：两项任务标记 `DONE`，并附审阅记录。

## 3.3 Agent-BE

- 执行任务：`TA-P0-005`
- 当日输出：
  - 群状态机 RFC（`PENDING_ONCHAIN | ACTIVE | REORGED_BACK`）
  - 成员状态机 RFC（`PENDING | FINALIZED | REMOVED`）
  - pending/finalized/reorg 行为说明（含 provisional）
- 完成标准：状态转移图与行为规则可被 QA 用例直接引用。

## 3.4 Agent-QA

- 执行任务：`TA-P0-007`
- 当日输出：
  - 合约/API/集成/E2E 测试矩阵
  - Phase Gate 的“通过/不通过”判据清单
- 完成标准：测试策略可覆盖实施计划中的全部 Exit Criteria。

## 3.5 Agent-TL

- 执行任务：`TA-P0-008`
- 当日输出：
  - Phase Gate 模板
  - 风险清单模板（风险、影响、缓解、owner、截止日期）
- 完成标准：当天可组织一次 30 分钟 Gate 评审会并形成结论。

## 4. 沟通与交付节奏（Day 1）

- 10:00：Kickoff（15 分钟）
- 14:00：中途同步（15 分钟）
- 18:00：Phase 0 Gate（30 分钟）

每次同步只回答 4 件事：
1. 当前任务 ID
2. 当前状态（TODO/IN_PROGRESS/BLOCKED/DONE）
3. 阻塞项
4. 下一步动作

## 5. Day 1 产出清单（收口检查）

当天结束前必须具备：

1. WBS 中 `TA-P0-001` 到 `TA-P0-008` 均有状态更新。
2. 每个任务至少 1 条证据链接（文档路径、PR、测试记录）。
3. 形成一份 Phase 0 Gate 结论：
   - `PASS`：Week 2 进入 Phase 1
   - `CONDITIONAL PASS`：列出补丁项与截止时间
   - `FAIL`：列出阻塞项与责任人
4. Gate 结论必须写入：`docs/implementation/gates/phase-0-gate.md`

## 6. 快速阻塞处理规则

- 遇到强约束冲突（如 API 前缀、DID 规则）时，不讨论实现细节，先提 ADR。
- 遇到信息缺失时，默认按设计文档执行，不做口头约定。
- 阻塞超过 2 小时必须升级到 Agent-TL。

## 7. Day 2 及以后执行规则

1. 每天开始前都先阅读：`docs/README.md`（固定顺序，不可跳过）。
2. 若当前仍在 Week 1（`2026-03-02` 到 `2026-03-08`），默认继续执行 Phase 0 任务（`TA-P0-001` ~ `TA-P0-008`）并补齐证据。
3. Day 2 不等于自动进入 Phase 1；是否进入 Phase 1 由 Gate 结论决定。
4. 仅当以下条件同时满足，才允许进入 Phase 1：
   - `docs/implementation/gates/phase-0-gate.md` 结论为 `PASS`，或 `CONDITIONAL PASS` 且补丁项已关闭；
   - 合约接口签名冻结（对应 `TA-P1-001` 可直接启动）；
   - 团队 owner 映射确定（角色 -> 真实成员）。
5. 按基线排期，Phase 1 启动周为 Week 2（`2026-03-09` 到 `2026-03-15`）；除非 TL 明确批准提前切换。
