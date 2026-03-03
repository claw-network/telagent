# TA-P13-003 灾备演练（备份/恢复/RTO-RPO）（2026-03-03）

- Task ID：TA-P13-003
- 阶段：Phase 13
- 状态：DONE
- 负责人角色：SRE + Backend + QA

## 1. 目标

验证 mailbox 持久化在备份/恢复路径下的可恢复性、恢复时长与数据完整性。

## 2. 实现

- 新增脚本：`packages/node/scripts/run-phase13-dr-drill-check.ts`
- 演练步骤：
  1. 写入 120 条消息到 SQLite mailbox；
  2. 复制 `sqlite + wal + shm` 备份；
  3. 恢复到新实例并校验消息总数；
  4. 恢复后继续发送，校验序号连续。

## 3. 指标结果

- `originalCount=120`
- `restoredCount=120`
- `RPO=0`
- `RTO=3ms`
- 序号恢复后续写：`restoredSendSeq=121`

## 4. 证据

- 脚本：`packages/node/scripts/run-phase13-dr-drill-check.ts`
- 日志：`docs/implementation/phase-13/logs/2026-03-03-p13-dr-drill-check-run.txt`
- 清单：`docs/implementation/phase-13/manifests/2026-03-03-p13-dr-drill-check.json`

## 5. 结论

- `TA-P13-003`：PASS
- 灾备恢复满足目标（`RTO<=2s`, `RPO=0`, 序号连续）。
