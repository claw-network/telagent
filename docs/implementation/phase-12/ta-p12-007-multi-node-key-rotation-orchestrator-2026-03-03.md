# TA-P12-007 多节点密钥轮换编排脚本（2026-03-03）

- Task ID：TA-P12-007
- 阶段：Phase 12（v1.2 候选能力冻结与排程）
- 状态：DONE
- 负责人角色：Security + SRE

## 1. 目标

交付可复现的多节点密钥轮换编排脚本，覆盖分批轮换、故障注入与回滚恢复演练，满足以下验收：

1. 多节点分批（canary/wave）轮换流程可复现；
2. 故障节点可执行回滚恢复并恢复可用；
3. 轮换 grace 期后旧 key 全量退役（不可再用）；
4. 产出机读清单与执行日志，支持运营审计追踪。

## 2. 实现范围

### 2.1 编排专项脚本

- 新增：`packages/node/scripts/run-phase12-key-rotation-orchestrator-check.ts`
- 场景覆盖：
  - 6 节点 fleet（`node-a` ~ `node-f`），每节点 `signal/mls` 两套 key；
  - 轮换批次：
    - `canary`: `node-a`
    - `wave-1`: `node-b`, `node-c`
    - `wave-2`: `node-d`, `node-e`, `node-f`
  - 故障注入：
    - 在 `node-e` 上撤销新 key（`v2`）模拟轮换后 smoke-check 失败；
  - 回滚恢复：
    - 对 `node-e` 执行 `recoverKey` 到 rollback key（`v2-rollback`）；
  - 收口校验：
    - 所有节点当前 key 可用；
    - 所有 `v1` 旧 key 在 grace 期后不可用；
    - 事件流水（register/rotate/revoke/recover）完整输出。

### 2.2 单测补齐

- 新增：`packages/node/src/services/key-rotation-orchestrator.test.ts`
- 用例：
  - `TA-P12-007 orchestrator supports staged key rotation with rollback recovery`
- 覆盖：
  - 分批轮换保持未命中节点稳定；
  - 故障节点撤销后不可用；
  - 回滚恢复后重新可用；
  - grace 期后旧 key 全量退役。

## 3. 执行命令

```bash
corepack pnpm --filter @telagent/node build
corepack pnpm --filter @telagent/node test
corepack pnpm --filter @telagent/node exec tsx scripts/run-phase12-key-rotation-orchestrator-check.ts
```

## 4. 证据

- 代码：
  - `packages/node/scripts/run-phase12-key-rotation-orchestrator-check.ts`
  - `packages/node/src/services/key-rotation-orchestrator.test.ts`
- 日志：
  - `docs/implementation/phase-12/logs/2026-03-03-p12-node-build.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-node-test.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-key-rotation-orchestrator-check-run.txt`
- 清单：
  - `docs/implementation/phase-12/manifests/2026-03-03-p12-key-rotation-orchestrator-check.json`

## 5. 结论

- `TA-P12-007`：PASS
- 多节点密钥轮换编排（分批 + 回滚剧本）已可复现，并具备机读化验收证据。
