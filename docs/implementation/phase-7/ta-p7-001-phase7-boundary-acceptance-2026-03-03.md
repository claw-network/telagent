# TA-P7-001 Phase 7 边界与验收标准冻结（2026-03-03）

- Task ID：TA-P7-001
- 阶段：Phase 7（Postgres 集群压测与故障演练）
- 状态：DONE
- 负责人角色：TL / BE / SRE / QA

## 1. 目标

对 Phase 6 Gate 的 Accepted Risk（“尚未完成真实 Postgres 集群压测与故障演练”）做闭环收口，冻结本阶段范围、验收标准与证据格式。

## 2. 范围

1. 多实例并发一致性校验（同一会话高并发写入，保证 `seq` 单调且无重复）。
2. 故障演练（Postgres 实例重启后，消息持久化与序号连续性保持）。
3. 回归验证（`@telagent/node` build/test 全绿，保证 `/api/v1/*` 与 RFC7807 约束无回归）。

## 3. 验收标准

1. `TA-P7-002` 脚本输出 manifest `decision=PASS`，并且：
   - `duplicateSeqCount=0`
   - `missingSeqCount=0`
   - `dedupeReplayRate=1`
2. `TA-P7-003` 脚本输出 manifest `decision=PASS`，并且：
   - `persistedAcrossRestart=true`
   - `sequenceContinuesAfterRestart=true`
3. 回归日志归档到 `docs/implementation/phase-7/logs/`。
4. Gate 文档 `docs/implementation/gates/phase-7-gate.md` 给出 `PASS` 结论。

## 4. 实施约束

- API 路径保持 `/api/v1/*`，不引入破坏性改动。
- DID 规则保持 `did:claw:*` 与 `keccak256(utf8(did))`。
- 不引入 relayer/paymaster（仍然用户自付 gas）。
- 证据产出遵循“日志 + manifest + 任务文档 + Gate”四件套。

## 5. 下一步

进入 `TA-P7-002`：执行 Postgres 多实例并发一致性校验并归档证据。
