# TA-P9-003 联邦协议灰度兼容脚本检查（2026-03-03）

- Task ID：TA-P9-003
- 阶段：Phase 9（联邦跨域运行手册与灰度兼容）
- 状态：DONE
- 负责人角色：Backend Engineer / QA

## 1. 目标

通过脚本化场景验证协议兼容矩阵在灰度升级路径中的行为：

1. `v1 -> v2` 兼容放行；
2. 无 hint 的旧流量保持兼容；
3. `v3` 等非兼容版本被拒绝；
4. `node-info` 暴露计数准确。

## 2. 实现

- 新增脚本：`packages/node/scripts/run-phase9-federation-protocol-compat-check.ts`
  - 输出 manifest：
    `docs/implementation/phase-9/manifests/2026-03-03-p9-federation-protocol-compat-check.json`

## 3. 执行命令

```bash
pnpm --filter @telagent/node exec tsx scripts/run-phase9-federation-protocol-compat-check.ts
```

## 4. 证据

- 日志：`docs/implementation/phase-9/logs/2026-03-03-p9-federation-protocol-compat-check-run.txt`
- 清单：`docs/implementation/phase-9/manifests/2026-03-03-p9-federation-protocol-compat-check.json`

## 5. 结论

- `scenarios=4/4`
- `decision=PASS`
- 兼容矩阵与拒绝计数表现符合预期，可用于跨域灰度升级前置校验。
