# TA-P15-006 Web App 客户端质量体系与发布门禁冻结（2026-03-03）

- Task ID：TA-P15-006
- 阶段：Phase 15
- 状态：DONE
- 负责人角色：QA + Frontend + SRE

## 1. 目标

建立可执行的客户端质量门禁体系，覆盖测试分层、性能预算、崩溃与观测、发布与回滚检查清单，并固化 Gate 判定规则。

## 2. 范围与约束

1. 适用范围：Web/PWA/Desktop/Mobile 客户端体系，当前以 Web 主线验证为基准。
2. API 边界：仅允许 `/api/v1/*`。
3. DID 边界：仅允许 `did:claw:*`，DID hash 固定 `keccak256(utf8(did))`。
4. 错误边界：错误语义统一 RFC7807（`application/problem+json`）。
5. 任务边界：本任务冻结质量与发布门禁策略，不在本任务实现全部自动化脚本。

## 3. 测试分层与执行层级

## 3.1 测试分层（Client Quality Pyramid）

| 层级 | 目标 | 当前基线命令 | 判定标准 |
| --- | --- | --- | --- |
| L0 Unit | 组件/状态机纯逻辑正确性 | `corepack pnpm --filter @telagent/web test` | 关键模块用例通过率 `100%` |
| L1 Contract | API 与错误契约一致性 | `corepack pnpm --filter @telagent/node test` | `/api/v1/*`、RFC7807、权限约束不回退 |
| L2 SDK Parity | TS/Python SDK 行为一致性 | `corepack pnpm --filter @telagent/sdk test` + `python3 -m unittest ...` | 核心调用和错误映射一致 |
| L3 E2E Critical Path | 关键用户旅程稳定 | （Phase 15 关闭前补齐） | `create -> invite -> accept -> send -> pull` 全链路通过 |
| L4 Perf & Resilience | 性能与恢复能力达标 | （Nightly/Release Candidate） | 满足 `TA-P15-005` 性能预算和恢复预算 |

## 3.2 执行层级（Pipeline Levels）

1. `Pre-Merge`：Web build + Node contract tests + SDK TS tests。
2. `Nightly`：Pre-Merge 全量 + Python SDK tests + 离线恢复专项回放。
3. `Release Candidate`：Nightly 全量 + E2E 关键路径 + 性能预算验证 + 发布清单复核。

## 4. 门禁规则（Quality Gates）

## 4.1 必过门槛

| Gate | 条件 | 失败动作 |
| --- | --- | --- |
| G1 Build Gate | Web/Node 构建全部通过 | 阻断合入 |
| G2 Contract Gate | `/api/v1/*` 契约、RFC7807、权限回归通过 | 阻断合入并触发回归修复 |
| G3 SDK Gate | TS/Python SDK 一致性通过 | 阻断 release candidate |
| G4 Offline Gate | 离线重放/冲突策略回放通过 | 阻断 release candidate |
| G5 Reliability Gate | 崩溃率、恢复时延、关键路径成功率达标 | 阻断正式发布 |

## 4.2 风险例外机制

1. 仅允许 `P2/P3` 风险豁免，且需记录补偿计划和截止时间。
2. `P0/P1` 缺陷、协议错误、数据一致性风险不得豁免。
3. 任何豁免必须记录到 Gate 结论文档并可追踪关闭状态。

## 5. 观测与崩溃治理

## 5.1 关键指标（Minimum Set）

| 指标 | 目标阈值 | 采样周期 |
| --- | --- | --- |
| `clientCrashFreeRate` | `>= 99.5%` | 24h |
| `criticalJourneySuccessRate` | `>= 99.0%` | 24h |
| `offlineRecoveryLatencyP95` | `<= 1500ms` | 24h |
| `sendAckLatencyP95` | `<= 120ms` | 24h |
| `deadLetterRate` | `< 0.5%` | 24h |

## 5.2 观测字段规范

1. 必填字段：`timestamp`, `platform`, `appVersion`, `traceId`, `conversationId(optional)`, `errorCode(optional)`。
2. 身份字段：禁止明文 DID 入日志，保留脱敏 DID 或 DID hash（`keccak256(utf8(did))`）。
3. 错误字段：统一记录 RFC7807 `status/code/instance`。

## 5.3 崩溃治理流程

1. 崩溃聚合：按版本和平台聚类。
2. 自动告警：超过阈值立即触发发布冻结。
3. RCA 归档：每次高优先级崩溃需附修复提交与回归验证。

## 6. 发布与回滚清单（Release Readiness）

## 6.1 发布前检查

1. 全部门禁（G1~G5）通过。
2. 关键配置检查：API 前缀、身份校验、错误映射策略与生产一致。
3. 版本清单检查：Web、SDK TS、SDK Python 版本矩阵一致。
4. 灰度策略检查：灰度比例、观察窗口、回滚开关可用。

## 6.2 发布后检查

1. 首小时高频观察：崩溃率、关键路径成功率、错误码分布。
2. 首日观察：离线恢复时延、dead-letter 比率。
3. 达到阈值触发：自动降级或回滚。

## 6.3 回滚触发条件

1. `clientCrashFreeRate < 99.0%`。
2. `criticalJourneySuccessRate < 98.0%` 持续 30 分钟。
3. `FORBIDDEN/UNPROCESSABLE` 非预期激增（相对过去 24h 超 3 倍）。

## 7. TA-P15-006 基线执行结果（2026-03-03）

1. Web build：PASS（日志见 `2026-03-03-p15-web-build-ta-p15-006.txt`）。
2. Web test：当前包返回 `no tests for web package`，记录为已识别测试覆盖缺口。
3. Node tests：PASS（`89/89`）。
4. SDK TS tests：PASS（`4/4`）。
5. SDK Python tests：PASS（`4/4`）。

补偿动作：

1. 在 `TA-P15-007` Gate 收口中明确 web E2E 最小集是否作为放行前置条件。
2. 若作为前置条件，需补齐并追加证据后方可关闭 Phase 15。

## 8. TA-P15-006 验收清单

- [x] 测试分层、执行层级与门禁规则冻结。
- [x] 观测指标、崩溃治理与回滚条件冻结。
- [x] 发布前后检查清单冻结。
- [x] `/api/v1/*`、`did:claw:*`、DID hash、RFC7807 约束显式写入。
- [x] 任务级 build/test 证据归档（Web/Node/SDK TS/SDK Python）。
- [x] README/WBS/Iteration Board 状态同步完成。

## 9. 证据

- 任务文档：`docs/implementation/phase-15/ta-p15-006-webapp-quality-gates-and-release-readiness-2026-03-03.md`
- Web build：`docs/implementation/phase-15/logs/2026-03-03-p15-web-build-ta-p15-006.txt`
- Web test：`docs/implementation/phase-15/logs/2026-03-03-p15-web-test-ta-p15-006.txt`
- Node build：`docs/implementation/phase-15/logs/2026-03-03-p15-node-build-ta-p15-006.txt`
- Node test：`docs/implementation/phase-15/logs/2026-03-03-p15-node-test-ta-p15-006.txt`
- SDK TS test：`docs/implementation/phase-15/logs/2026-03-03-p15-sdk-ts-test-ta-p15-006.txt`
- SDK Python test：`docs/implementation/phase-15/logs/2026-03-03-p15-sdk-python-test-ta-p15-006.txt`
- 专项检查日志：`docs/implementation/phase-15/logs/2026-03-03-p15-quality-gates-check-run.txt`
- 机读清单：`docs/implementation/phase-15/manifests/2026-03-03-p15-quality-gates-check.json`

## 10. 结论

- `TA-P15-006`：PASS
- 下一步：进入 `TA-P15-007`（Phase 15 Gate 评审与收口）。
