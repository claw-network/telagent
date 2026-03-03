# TA-P10-003 联邦应急回滚演练（2026-03-03）

- Task ID：TA-P10-003
- 阶段：Phase 10（联邦灰度发布自动化与应急回滚编排）
- 状态：DONE
- 负责人角色：Backend Engineer / QA

## 1. 目标

验证联邦协议升级后可在故障窗口快速回退，并恢复对 legacy 版本流量的兼容接入。

## 2. 实现

### 2.1 新增脚本

- 文件：`packages/node/scripts/run-phase10-federation-rollback-drill.ts`
- 核心能力：
  - 读取灰度发布 manifest 并校验回滚步骤完整性；
  - 模拟 rollout 服务（`v3`）与 rollback 服务（`v2`）对不同协议版本流量的接受/拒绝；
  - 校验拒绝路径返回 `UNPROCESSABLE`（RFC7807 映射）；
  - 输出回滚演练机读清单。

### 2.2 输出清单

- 文件：`docs/implementation/phase-10/manifests/2026-03-03-p10-federation-rollback-drill.json`
- 核心结果：
  - `rolloutAcceptsTarget=true`
  - `rolloutRejectsLegacy=true`
  - `rollbackAcceptsLegacy=true`
  - `rollbackRejectsTarget=true`
  - `rollbackStepsPrepared=true`
  - `decision=PASS`

## 3. 执行命令

```bash
pnpm --filter @telagent/node exec tsx scripts/run-phase10-federation-rollback-drill.ts
```

## 4. 证据

- 运行日志：`docs/implementation/phase-10/logs/2026-03-03-p10-federation-rollback-drill-run.txt`
- 输出清单：`docs/implementation/phase-10/manifests/2026-03-03-p10-federation-rollback-drill.json`
- 回归日志：`docs/implementation/phase-10/logs/2026-03-03-p10-node-test.txt`，`docs/implementation/phase-10/logs/2026-03-03-p10-workspace-test.txt`

## 5. 结论

- `TA-P10-003`：PASS
- 联邦升级回滚路径已形成可验证剧本，满足一键回退演练要求。
