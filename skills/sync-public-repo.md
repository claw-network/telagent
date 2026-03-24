# Skill: Sync Private → Public Repository

## Overview

TelAgent 采用双仓库架构：`telagent-dev`（私有，日常开发）增量同步到 `telagent`（公开，开源发布）。同步通过 GitHub Action 自动完成，仅同步变更内容（rsync 增量），并带时间门控：白天（08:00-19:00 CST）的 push 不触发同步，19:00 后的 push 自动同步当天所有累积变更。

---

## Architecture

```
┌──────────────────────────┐          ┌──────────────────────────┐
│  claw-network/telagent-dev│  sync   │  claw-network/telagent   │
│  (PRIVATE)               │ ──────▶  │  (PUBLIC)                │
│  日常开发仓库            │  GitHub  │  开源仓库                │
│  完整内容 + 历史         │  Action  │  过滤后内容 · 增量同步   │
└──────────────────────────┘          └──────────────────────────┘
```

### Key Facts

| Item | Value |
|------|-------|
| **Private repo** | `claw-network/telagent-dev` |
| **Public repo** | `claw-network/telagent` |
| **License** | Apache-2.0 |
| **Sync workflow** | `.github/workflows/sync-public.yml` |
| **Exclusion list** | `.public-sync-ignore`（信息性，工作流使用 rsync --exclude + 显式 rm） |
| **Public copilot instructions** | `.github/copilot-instructions.public.md` |
| **Auth** | `PUBLIC_REPO_PAT` secret on telagent-dev |
| **Trigger** | push to `main`（19:00-07:59 CST）、tag push (`20*`，当前仓库使用 CalVer）、手动 `workflow_dispatch` |
| **Time gate** | 08:00-19:00 CST skip；其余时段 + 手动 dispatch + tag push 始终同步 |
| **Public history** | 增量 commit，保留完整 git 历史 |
| **Sync mode** | rsync 增量同步（仅同步变更文件） |

---

## Excluded from Public Repo

| Path | Reason |
|------|--------|
| `docs/` | 工作流会先排除整个 `docs/`；只有 `docs/guides/` 和 `docs/README.md` 存在时才会单独同步回来。当前私有仓里这两个路径都不存在，因此 docs 目前等效于整体排除 |
| `skills/` | 部署技能（含服务器信息） |
| `localdev/` | 本地开发节点配置（含生产 IP、SSH key、.env.cloud） |
| `temp/` | 临时文件 |
| `scripts/deploy-node.sh` | 含服务器 IP、SSH key 路径 |
| `scripts/deploy-install-assets.sh` | 部署资产脚本 |
| `scripts/redeploy.sh` | 生产重部署脚本 |
| `.public-sync-ignore` | 排除列表本身 |
| `.github/copilot-instructions.md` | 含凭据，替换为 `.public.md` 版本 |
| `.github/copilot-instructions.public.md` | 源文件，同步后变为 `.md` |
| `.github/workflows/sync-public.yml` | 同步工作流本身 |

### Public Repo 保留的内容

- 所有 `packages/` 代码（protocol, node, sdk, sdk-python, console, webapp, contracts）
- `scripts/`（公开部分：setup.sh, bump-version.mjs, check-runtime.mjs, faucet-server.mts, ensure-local-certs.sh, mkcert/）
- `LICENSE`、`README.md`、`README_CN.md`
- `pnpm-workspace.yaml`、`tsconfig.base.json`、`package.json`
- `.env.example`

---

## Sync Workflow Steps

1. **Time gate check**：判断当前时间（Asia/Shanghai），08:00-18:59 skip，手动 dispatch / tag push 始终放行
2. **Checkout** 代码（depth 1）
3. **Save commit message**：记录源 commit 的 message，用于公开仓库 commit
4. **Configure Git**：设置 bot 用户名和邮箱
5. **Clone public repo**：`git clone --depth 1` 公开仓库到 `/tmp/public-repo`（空仓库时 fallback 到 `git init`）
6. **Rsync 增量同步**：`rsync -a --delete` 排除私有路径，仅同步变更文件到 `/tmp/public-repo`
7. **按需同步公开 docs 子树**：docs 目录整体排除，仅当 `docs/guides/` 和 `docs/README.md` 实际存在时才单独同步
8. **替换 copilot instructions**：`cp .public.md` → `.md`
9. **防御性清理**：显式 `rm -rf` 确保 public repo 无私有目录残留
10. **Secret scan**：检查当前工作流里维护的 10 个已知敏感模式（IP、SSH key、私钥片段、passphrase、私有仓名等）
11. **Commit & push**：`git add -A && git diff --staged --quiet`（无变更则跳过），使用源 commit message 提交，普通 `git push`（非 force push）
12. **Tag sync**：如果触发事件是 tag push，同步 tag（`--force`）

---

## Common Operations

### 手动触发同步

```bash
gh workflow run sync-public.yml --repo claw-network/telagent-dev
```

### 查看同步状态

```bash
gh run list --workflow=sync-public.yml --repo claw-network/telagent-dev --limit 5
```

### 更新 PAT

PAT 过期或需要更换时：

1. 前往 https://github.com/settings/personal-access-tokens/new
2. Fine-grained PAT，仓库选 `claw-network/telagent`
3. 权限：Contents → Read and Write, Workflows → Read and Write
4. 生成后设置 secret：

```bash
echo "<NEW_PAT>" | gh secret set PUBLIC_REPO_PAT --repo claw-network/telagent-dev
```

### 新增排除路径

1. 编辑 `.public-sync-ignore`（信息性记录）
2. 编辑 `.github/workflows/sync-public.yml` 的 "Incremental sync via rsync" step：
   - 在 rsync `--exclude` 列表中添加路径
   - 在防御性清理部分也添加对应 `rm` 命令
3. 如路径可能含敏感信息，在 "Verify no secrets leaked" step 添加检测模式
4. commit + push 到 main（19:00 后），自动触发同步

### 新增敏感模式检测

在 `sync-public.yml` 的 secret scan step 中的 `for pattern in` 循环添加新模式（使用唯一前缀片段，避免误报）。

---

## Troubleshooting

### Sync workflow 失败

```bash
# 查看最近失败的 run
gh run list --workflow=sync-public.yml --repo claw-network/telagent-dev --status failure --limit 3

# 查看具体日志
gh run view <RUN_ID> --repo claw-network/telagent-dev --log-failed
```

### Secret leak detected

工作流检测到敏感模式时会中止。排查步骤：

1. 查看日志确认哪个 pattern 在哪个文件匹配
2. 在源文件中移除或替换敏感内容
3. 或将该文件加入排除列表
4. 重新 push 触发同步

### PAT 权限不足

错误表现为 `push` 步骤 403/404。确认：
- PAT 仍有效（未过期）
- PAT 的 Repository access 包含 `claw-network/telagent`
- PAT 有 Contents: Read and Write 权限
- 如果公开仓库有 workflow 文件变更，PAT 还需要 Workflows: Read and Write

### 时间门控跳过了同步

白天 push 不会立即同步。两种解决方式：
1. 等到 19:00 后再 push 一次（内容会自动累积）
2. 手动触发：`gh workflow run sync-public.yml --repo claw-network/telagent-dev`

---

## Security Notes

- 公开仓库保留增量 git 历史，commit message 来自私有仓库（确保 commit message 不含敏感信息）
- rsync 排除列表 + 防御性 `rm -rf` 双重保障，确保私有路径不进入公开仓库
- `.github/copilot-instructions.md` 自动替换为不含服务器 IP、凭据、部署流程的版本
- 每次同步运行 secret scan，检测当前工作流里维护的 10 个已知敏感模式（IP 段、SSH key 名、私钥片段、passphrase、私有仓名等）
- 所有 `.env` 中的私钥为开发用途（Hardhat 标准账号），生产私钥仅在 `.env.cloud`（不在 git 中）
- 白天（08:00-19:00 CST）不同步，减少敏感代码意外暴露窗口
- `localdev/` 包含完整的生产节点配置（IP、SSH、.env.cloud），已在排除列表中
