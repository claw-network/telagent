# TA-P8-003 跨 AZ 延迟/脑裂模拟检查（2026-03-03）

- Task ID：TA-P8-003
- 阶段：Phase 8（联邦韧性与可观测增强）
- 状态：DONE
- 负责人角色：Backend Engineer / QA

## 1. 目标

用脚本化方式验证联邦 group-state 在异常时序下的行为一致性，覆盖：

1. 自动版本启动与 dedupe；
2. 自动版本推进与显式高版本接收；
3. stale 版本拒绝；
4. split-brain 检测与后续恢复。

## 2. 实现

- 新增脚本：`packages/node/scripts/run-phase8-federation-resilience-check.ts`
- 输出清单：`docs/implementation/phase-8/manifests/2026-03-03-p8-federation-resilience-check.json`

## 3. 执行命令

```bash
pnpm --filter @telagent/node exec tsx scripts/run-phase8-federation-resilience-check.ts
```

## 4. 证据

- 脚本日志：`docs/implementation/phase-8/logs/2026-03-03-p8-federation-resilience-check-run.txt`
- 机读清单：`docs/implementation/phase-8/manifests/2026-03-03-p8-federation-resilience-check.json`

## 5. 结论

- `scenarios=4/4`
- `decision=PASS`
- resilience 计数正确：`stale=1`、`splitBrain=1`、`total=2`
