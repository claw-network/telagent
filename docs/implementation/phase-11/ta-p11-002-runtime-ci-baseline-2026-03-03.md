# TA-P11-002 Node Runtime/CI 基线固化（2026-03-03）

- Task ID：TA-P11-002
- 阶段：Phase 11（v1.1 安全与运营能力增强）
- 状态：DONE
- 负责人角色：TL / DevEx

## 1. 目标

固化 TelAgent 工程运行时基线，消除 Node 版本漂移带来的构建不确定性，并让 CI 在固定版本上执行严格校验。

## 2. 实现

### 2.1 运行时基线声明

- 新增：`.nvmrc`（`22.19.0`）
- 新增：`.node-version`（`22.19.0`）
- 更新：`package.json`
  - `engines.node = ">=22 <25"`
  - `engines.pnpm = ">=10.18.1 <11"`
  - 新增脚本 `check:runtime`

### 2.2 运行时检查脚本

- 新增：`scripts/check-runtime.mjs`
- 能力：
  - 检查 Node major 是否为 22；
  - 检查 pnpm major 是否为 10；
  - 默认 non-strict 模式仅警告；
  - strict 模式（`--strict`）不符合时返回非 0。

### 2.3 CI 工作流

- 新增：`.github/workflows/ci.yml`
- 流程：
  1. 固定 `pnpm 10.18.1`
  2. 固定 `Node 22.19.0`
  3. `pnpm install --frozen-lockfile`
  4. `pnpm run check:runtime -- --strict`
  5. `pnpm -r build`
  6. `pnpm -r test`

## 3. 执行命令

```bash
pnpm run check:runtime
pnpm -r build
pnpm -r test
```

## 4. 证据

- 运行时检查日志：`docs/implementation/phase-11/logs/2026-03-03-p11-runtime-check.txt`
- 全量构建日志：`docs/implementation/phase-11/logs/2026-03-03-p11-workspace-build.txt`
- 全量测试日志：`docs/implementation/phase-11/logs/2026-03-03-p11-workspace-test.txt`
- CI 文件：`.github/workflows/ci.yml`

## 5. 结论

- `TA-P11-002`：PASS
- 运行时与 CI 基线已固化，后续任务可在统一环境下推进。
