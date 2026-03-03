# TA-P7-002 Postgres 多实例并发一致性校验（2026-03-03）

- Task ID：TA-P7-002
- 阶段：Phase 7（Postgres 集群压测与故障演练）
- 状态：DONE
- 负责人角色：BE / SRE / QA

## 1. 目标

验证多实例（多个 Node 进程共享同一 Postgres mailbox store）场景下：

1. 会话 `seq` 仍保持单调且无重复；
2. 幂等重放不会产生重复写入；
3. pull 视图可回读完整 canonical 消息集合。

## 2. 实现

- 新增脚本：`packages/node/scripts/run-phase7-postgres-multi-instance-check.ts`
  - 使用多个 `PostgresMessageRepository` + `MessageService` 实例并发发送；
  - 对同一 `conversationId` 做高并发写入；
  - 回放部分 `envelopeId` 做 dedupe 校验；
  - 产出机读报告（manifest）。

## 3. 执行命令

```bash
pnpm --filter @telagent/node exec tsx scripts/run-phase7-postgres-multi-instance-check.ts
```

## 4. 证据

- 脚本日志：`docs/implementation/phase-7/logs/2026-03-03-p7-postgres-multi-instance-check-run.txt`
- 机读清单：`docs/implementation/phase-7/manifests/2026-03-03-p7-postgres-multi-instance-check.json`

## 5. 结论

- `decision=PASS`
- `duplicateSeqCount=0`
- `missingSeqCount=0`
- `dedupeReplayRate=1`
- 多实例共享 Postgres mailbox state 时，写入顺序与幂等行为满足预期。
