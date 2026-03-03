# TA-P7-003 Postgres 故障演练（重启恢复）（2026-03-03）

- Task ID：TA-P7-003
- 阶段：Phase 7（Postgres 集群压测与故障演练）
- 状态：DONE
- 负责人角色：SRE / BE / QA

## 1. 目标

验证 Postgres 故障（容器重启）后的恢复能力：

1. 重启前写入的离线消息可回读；
2. 重启后继续写入时 `seq` 连续；
3. 故障恢复流程可被脚本化复现并产出证据。

## 2. 实现

- 新增脚本：`packages/node/scripts/run-phase7-postgres-fault-drill.ts`
  - 先写入首条消息并关闭首个 repository；
  - 执行 `docker restart <container>`；
  - 等待 Postgres readiness；
  - 重新建连并回读首条消息；
  - 发送第二条消息，验证 `seq` 递增；
  - 输出故障演练 manifest。

## 3. 执行命令

```bash
pnpm --filter @telagent/node exec tsx scripts/run-phase7-postgres-fault-drill.ts
```

## 4. 证据

- 脚本日志：`docs/implementation/phase-7/logs/2026-03-03-p7-postgres-fault-drill-run.txt`
- 机读清单：`docs/implementation/phase-7/manifests/2026-03-03-p7-postgres-fault-drill.json`

## 5. 结论

- `decision=PASS`
- `restartCommandSucceeded=true`
- `persistedAcrossRestart=true`
- `sequenceContinuesAfterRestart=true`
- 故障恢复链路满足 Phase 7 验收要求。
