# TA-P5-003 故障注入演练（2026-03-03）

- Task ID：TA-P5-003
- 阶段：Phase 5
- 状态：DONE
- 负责人角色：QA Engineer / SRE / Backend Engineer

## 1. 目标

对 Phase 5 验收前关键风险执行可复现故障注入，覆盖：

1. 链拥堵（RPC 超时 / 临时不可达）
2. 链重组（reorg 触发回滚与重放）
3. 联邦故障（鉴权失败 / 限流 / 域名不一致）

## 2. 实现

- 新增演练脚本：`packages/node/scripts/run-phase5-fault-injection.ts`
  - 场景 A：`chain-congestion`
    - 首次 `getLogs` 注入 `RPC_TIMEOUT_DURING_CONGESTION`
    - 二次 catch-up 恢复并收敛到正确 block 与群状态
  - 场景 B：`reorg-recovery`
    - 构造链分叉并触发回滚重放
    - 验证 pending 成员从旧分支收敛到新分支，`reorgCount=1`
  - 场景 C：`federation-failure`
    - 验证 UNAUTHORIZED / FORBIDDEN / TOO_MANY_REQUESTS
    - 通过窗口推进和合法参数恢复同步成功
- 输出清单：
  - 运行日志：`docs/implementation/phase-5/logs/2026-03-03-p5-fault-injection-run.txt`
  - 演练报告：`docs/implementation/phase-5/manifests/2026-03-03-p5-fault-injection-drill.json`

## 3. 演练结果

- `chain-congestion`：PASS（首次失败后恢复，`recoveredLastIndexedBlock=16`）
- `reorg-recovery`：PASS（`reorgCount=1`，pending 成员完成 canonical 切换）
- `federation-failure`：PASS（鉴权/限流/域名异常拦截，恢复后可继续同步）
- 总结：`3/3 PASS`，`passRate=1.0`

## 4. 回归验证

- Node 构建：`docs/implementation/phase-5/logs/2026-03-03-p5-node-build.txt`
- Node 测试：`docs/implementation/phase-5/logs/2026-03-03-p5-node-test.txt`
- 工作区测试：`docs/implementation/phase-5/logs/2026-03-03-p5-workspace-test.txt`

## 5. 下一步

进入 `TA-P5-004`（安全评审与上线检查清单）。
