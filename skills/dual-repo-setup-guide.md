# 双仓库架构实施指南：Private → Public 自动同步

> **来源项目**: ClawNet / TelAgent
> **日期**: 2026-03-17
> **目标读者**: 其他项目组的 agent，用于在新项目中实施相同的双仓库架构
> **前置条件**: GitHub 组织已创建，项目代码在一个私有仓库中

---

## 1. 方案概述

### 为什么要双仓库？

开源项目往往需要同时维护：
- **私有仓库**：包含服务器配置、部署凭据、内部文档、运维 skills 等敏感内容
- **公开仓库**：只包含代码、公开文档、示例，供社区使用

双仓库方案通过 GitHub Action 自动将私有仓库的公开内容同步到公开仓库，开发者日常只在私有仓库工作，无需手动管理两份代码。

### 核心设计

```
┌──────────────────────────┐          ┌──────────────────────────┐
│  org/project-dev         │  sync    │  org/project             │
│  (PRIVATE)               │ ──────▶  │  (PUBLIC)                │
│  日常开发仓库            │  GitHub  │  开源仓库                │
│  完整内容 + 完整历史     │  Action  │  过滤后内容 · 增量同步   │
└──────────────────────────┘          └──────────────────────────┘
```

**关键特性**：
- **rsync 增量同步**：仅同步变更文件，公开仓库保留完整 git 历史
- **时间门控**：白天（08:00-19:00 CST）push 不触发同步，减少意外暴露窗口；19:00 后自动同步累积变更
- push 到 `main`（非工作时间）或打 tag 时自动触发同步；手动 `workflow_dispatch` 始终放行
- tag 模式应匹配项目版本策略：CalVer 项目可用 `20*`，SemVer 项目可用 `v*`
- 同步前自动运行 secret scan，检测到泄露立即中止
- copilot-instructions 自动替换为脱敏版本

---

## 2. 实施步骤

### 阶段 A：规划排除内容

**先审计，后行动。** 在仓库中逐目录检查，分类为"公开"或"私有"。

常见需要排除的内容：

| 类型 | 典型路径 | 原因 |
|------|----------|------|
| 基础设施配置 | `infra/prod/`, `infra/staging/` | 含服务器 IP、端口、内部网络拓扑 |
| 部署文档/脚本 | `skills/`, `deploy/` | 含 SSH 地址、部署流程 |
| Copilot 指令 | `.github/copilot-instructions.md` | 可能含凭据、服务器信息 |
| 内部文档 | `docs/internal/`, `docs/handover/` | 架构决策、内部讨论 |
| Issue 跟踪 | `issues/` | 内部 bug/feature 讨论 |
| 临时文件 | `temp/`, `scratch/` | 调试脚本可能含敏感数据 |
| 环境配置 | `*.env`, `secrets.*` | 凭据（应已在 .gitignore 中） |

**决策原则**：
- 代码本身（`src/`, `packages/`, `lib/`）一般都公开
- 本地开发配置（devnet、docker-compose）公开
- 生产/测试环境配置私有
- API 文档（OpenAPI spec）公开，内部实现文档私有
- 示例代码、README、LICENSE、CHANGELOG 公开

### 阶段 B：收集敏感模式

在整个仓库中搜索硬编码的敏感信息：

```bash
# 搜索可能的私钥、密码、API key
grep -rn "password\|secret\|private.key\|api.key\|0x[a-f0-9]\{40,\}" . \
  --include='*.md' --include='*.yml' --include='*.yaml' \
  --include='*.json' --include='*.ts' --include='*.js' --include='*.sh' \
  | grep -v node_modules | grep -v .git
```

提取每个敏感值的 **唯一片段**（8-16 字符），用于同步时的自动检测。例如：
- API key `401ca444cbe821f7799e...` → 提取 `401ca444cbe821f7`
- 私钥 `0xb82233d82380d02515...` → 提取 `b82233d82380d025`
- 密码 `G66tdTcmvBz...` → 提取 `G66tdTcmvBz`

> ⚠️ **重要**：如果仓库曾经是 public 或任何 commit 中包含过敏感信息，转为 private 后这些信息仍可能被缓存。实施双仓库后应 **轮换所有暴露的凭据**。

### 阶段 C：创建公开仓库

```bash
# 创建公开仓库（空，不初始化）
gh repo create org/project --public --description "项目描述"

# 添加许可证（如果还没有）
# 在私有仓库根目录创建 LICENSE 文件（Apache-2.0 / MIT 等）
```

### 阶段 D：创建排除清单文件

在私有仓库根目录创建 `.public-sync-ignore`：

```
# Paths excluded from public repository sync.
# Used by .github/workflows/sync-public.yml to filter private content.
# This file is informational — the workflow uses rsync --exclude + defensive rm.
#
# Sync mode   : rsync incremental (preserves public repo git history)
# Time gate   : 08:00-19:00 CST skipped; manual dispatch + tag push always sync

# Internal documentation (except public API spec / developer guides)
docs/*

# Production infrastructure
infra/prod/
infra/staging/

# Deployment skills
skills/

# Internal issues and temp files
issues/
temp/

# This file itself
.public-sync-ignore

# Private copilot instructions (replaced with public version)
.github/copilot-instructions.md
.github/copilot-instructions.public.md

# Sync workflow itself
.github/workflows/sync-public.yml
```

> 注意：这个文件是**信息性**的（给人类和 agent 看），实际过滤由 workflow 中的 rsync `--exclude` + 防御性 `rm` 双重保障。这样做比用 `.gitignore` 语法更可靠，避免 glob 解析差异。

### 阶段 E：创建公开版 Copilot 指令

创建 `.github/copilot-instructions.public.md`，内容与私有版相同但 **移除**：
- 服务器 IP、SSH 地址
- API key、私钥、密码
- 部署流程和命令
- 内部 URL（管理后台等）

同步时会自动将此文件重命名为 `.github/copilot-instructions.md`。

### 阶段 F：创建同步 Workflow

创建 `.github/workflows/sync-public.yml`：

```yaml
name: Sync to Public Repo

on:
  push:
    branches: [main]
    tags:
      - '20*' # CalVer 项目；如果你的仓库用 SemVer，改成 'v*'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Check sync window
        id: timecheck
        run: |
          set -euo pipefail

          # Always sync: manual dispatch, tag push
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "Manual dispatch — syncing regardless of time."
            echo "skip=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          if [[ "$GITHUB_REF" == refs/tags/* ]]; then
            echo "Tag push — syncing regardless of time."
            echo "skip=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          # Time gate: skip during 08:00-18:59 CST (Asia/Shanghai)
          HOUR=$(TZ='Asia/Shanghai' date +%H)
          echo "Current hour (Asia/Shanghai): $HOUR"
          if [[ "$HOUR" -ge 8 && "$HOUR" -lt 19 ]]; then
            echo "Daytime (08:00-19:00 CST) — skipping sync."
            echo "skip=true" >> "$GITHUB_OUTPUT"
          else
            echo "After hours — proceeding with sync."
            echo "skip=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Checkout
        if: steps.timecheck.outputs.skip != 'true'
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Save commit message
        if: steps.timecheck.outputs.skip != 'true'
        id: commitmsg
        run: |
          MSG="$(git log -1 --format='%s' 2>/dev/null || echo 'update')"
          echo "msg=$MSG" >> "$GITHUB_OUTPUT"

      - name: Configure Git
        if: steps.timecheck.outputs.skip != 'true'
        run: |
          git config --global user.name "Sync Bot"
          git config --global user.email "bot@example.com"

      - name: Clone public repo
        if: steps.timecheck.outputs.skip != 'true'
        env:
          PUBLIC_REPO_PAT: ${{ secrets.PUBLIC_REPO_PAT }}
        run: |
          set -euo pipefail
          PUBLIC_REPO="https://x-access-token:${PUBLIC_REPO_PAT}@github.com/org/project.git"

          if ! git clone --depth 1 "$PUBLIC_REPO" /tmp/public-repo 2>/dev/null; then
            echo "Public repo empty or unreachable — initializing fresh."
            mkdir -p /tmp/public-repo
            cd /tmp/public-repo
            git init -b main
          fi

      - name: Incremental sync via rsync
        if: steps.timecheck.outputs.skip != 'true'
        run: |
          set -euo pipefail

          # Main rsync: sync everything except private paths
          rsync -a --delete \
            --exclude='.git' \
            --exclude='docs' \
            --exclude='skills' \
            --exclude='issues' \
            --exclude='temp' \
            --exclude='infra/prod' \
            --exclude='infra/staging' \
            --exclude='.public-sync-ignore' \
            --exclude='.github/copilot-instructions.md' \
            --exclude='.github/copilot-instructions.public.md' \
            --exclude='.github/workflows/sync-public.yml' \
            ./ /tmp/public-repo/

          # Sync docs/api/ separately (only public part of docs/)
          mkdir -p /tmp/public-repo/docs
          rsync -a --delete docs/api/ /tmp/public-repo/docs/api/

          # Replace copilot instructions with sanitized public version
          cp .github/copilot-instructions.public.md /tmp/public-repo/.github/copilot-instructions.md

          # Defensive cleanup: ensure no private paths leaked into public repo
          cd /tmp/public-repo
          rm -rf skills issues temp .public-sync-ignore
          rm -rf infra/prod infra/staging
          rm -f .github/copilot-instructions.public.md
          rm -f .github/workflows/sync-public.yml

          echo "=== Incremental sync complete ==="
          ls -d */ .github/ 2>/dev/null || true

      - name: Verify no secrets leaked
        if: steps.timecheck.outputs.skip != 'true'
        run: |
          set -euo pipefail
          cd /tmp/public-repo
          LEAKED=0

          # 检查已知敏感模式（每个值的唯一片段）
          for pattern in \
            "YOUR_SECRET_FRAGMENT_1" \
            "YOUR_SECRET_FRAGMENT_2" \
            "YOUR_SECRET_FRAGMENT_3"; do
            if grep -rqP "$pattern" . \
              --include='*.md' --include='*.yml' --include='*.yaml' \
              --include='*.json' --include='*.ts' --include='*.js' \
              --include='*.sh' --include='*.env' \
              --exclude-dir='.git' 2>/dev/null; then
              echo "LEAK DETECTED: pattern '$pattern' found in:"
              grep -rlP "$pattern" . \
                --include='*.md' --include='*.yml' --include='*.yaml' \
                --include='*.json' --include='*.ts' --include='*.js' \
                --include='*.sh' --include='*.env' \
                --exclude-dir='.git' 2>/dev/null
              LEAKED=1
            fi
          done

          if [[ $LEAKED -eq 1 ]]; then
            echo "::error::Secret leak detected! Aborting sync."
            exit 1
          fi
          echo "✅ No secrets detected in public content."

      - name: Commit and push
        if: steps.timecheck.outputs.skip != 'true'
        env:
          PUBLIC_REPO_PAT: ${{ secrets.PUBLIC_REPO_PAT }}
        run: |
          set -euo pipefail
          cd /tmp/public-repo

          PUBLIC_REPO="https://x-access-token:${PUBLIC_REPO_PAT}@github.com/org/project.git"

          git add -A

          # Skip if nothing changed
          if git diff --staged --quiet; then
            echo "✅ No changes to sync."
            exit 0
          fi

          ORIG_MSG="${{ steps.commitmsg.outputs.msg }}"
          git commit -m "$ORIG_MSG"

          # Ensure remote URL is set (for fresh init case)
          git remote set-url origin "$PUBLIC_REPO" 2>/dev/null || git remote add origin "$PUBLIC_REPO"
          git push origin main

          # Sync tag if this is a tag push
          if [[ "$GITHUB_REF" == refs/tags/* ]]; then
            TAG="${GITHUB_REF#refs/tags/}"
            git tag "$TAG"
            git push origin "$TAG" --force
          fi

          echo "✅ Synced to public repo"
```

### 阶段 G：配置 PAT

1. 前往 https://github.com/settings/personal-access-tokens/new
2. 选择 **Fine-grained personal access token**
3. Repository access → 选择**公开仓库**（`org/project`）
4. Permissions:
   - **Contents**: Read and Write
   - **Workflows**: Read and Write（如果公开仓库也有 GitHub Actions workflow 文件需要更新）
5. 生成后设置为私有仓库的 secret：

```bash
echo "github_pat_xxxx..." | gh secret set PUBLIC_REPO_PAT --repo org/project-dev
```

> ⚠️ 注意 `echo "TOKEN" | gh secret set NAME` 的语法——不要把 token 当成 secret name。

### 阶段 H：首次同步与验证

```bash
# 提交所有新增文件
git add .public-sync-ignore .github/copilot-instructions.public.md .github/workflows/sync-public.yml LICENSE
git commit -m "feat: add dual-repo sync infrastructure"
git push origin main

# 等待 workflow 运行
gh run watch --repo org/project-dev

# 验证公开仓库内容
gh repo view org/project --web
```

检查项：
- [ ] 私有目录（docs/、skills/、infra/prod/ 等）不在公开仓库中
- [ ] 公开目录（packages/、examples/ 等）正常存在
- [ ] `.github/copilot-instructions.md` 是脱敏版本
- [ ] 没有 `.github/workflows/sync-public.yml`
- [ ] 没有 `.public-sync-ignore`
- [ ] LICENSE 文件存在

---

## 3. CI 适配（重要！）

拆分后公开仓库会独立运行 CI（test、build、lint）。以下是常见需要修复的问题：

### 3.1 测试引用了被排除的文件

**症状**：测试引用了 `docs/`、`infra/` 等被排除目录中的文件（测试向量、fixture 数据等）。

**解决方案**：将测试依赖的数据文件复制到对应 package 的 `test/` 目录下，更新引用路径。

```typescript
// ❌ 引用被排除的 docs/ 目录
const vectorsDir = join(repoRoot, 'docs', 'implementation', 'test-vectors');

// ✅ 移到 package 本地目录
const vectorsDir = join(__dirname, 'vectors');
```

### 3.2 Docker 发布 403

**症状**：`docker/build-push-action` 推送到 GHCR 时返回 403 Forbidden。

**原因**：默认启用的 provenance attestation 需要 `id-token: write` 权限，某些组织策略禁止此权限。

**解决方案**：

```yaml
- uses: docker/build-push-action@v5
  with:
    push: true
    provenance: false   # ← 添加这行
```

### 3.3 Workflow 文件推送失败

**症状**：同步 push 返回 403，错误信息涉及 `refusing to allow a Personal Access Token to create or update workflow`。

**原因**：PAT 缺少 `workflow` scope。当公开仓库 `.github/workflows/` 中的文件发生变更时，push 需要此权限。

**解决方案**：更新 PAT，添加 Workflows: Read and Write 权限。

### 3.4 Caddy/Nginx 路径白名单

**问题**：如果项目有反向代理（Caddy/Nginx）配置 API key 鉴权，某些公开端点（如 faucet）可能被误拦截。

**解决方案**：公开端点需要在鉴权规则前添加路径例外。这虽然不直接是双仓库问题，但通常在开源准备阶段一起暴露出来。

---

## 4. 日常操作

### 新增排除路径

1. 在 `.public-sync-ignore` 中添加记录（信息性）
2. 在 `sync-public.yml` 的 "Incremental sync via rsync" step 中：
   - 在 rsync `--exclude` 列表中添加路径
   - 在防御性清理部分也添加对应 `rm` 命令
3. 如果该路径可能包含敏感信息，在 "Verify no secrets leaked" step 添加检测模式
4. commit + push（19:00 后），自动触发同步

### 手动触发同步

```bash
gh workflow run sync-public.yml --repo org/project-dev
```

### 查看同步状态

```bash
gh run list --workflow=sync-public.yml --repo org/project-dev --limit 5
```

### 更换 PAT

PAT 过期时：
1. 生成新 PAT（同 阶段 G 的步骤）
2. 更新 secret：`echo "NEW_PAT" | gh secret set PUBLIC_REPO_PAT --repo org/project-dev`
3. 手动触发一次同步验证

---

## 5. 踩坑记录

以下是 ClawNet 实施过程中遇到的实际问题：

### 坑 1：`.public-sync-ignore` 不是真正的 ignore 文件

最初考虑过让 workflow 解析 `.public-sync-ignore`（类似 `.gitignore`），但 glob 解析在不同 shell 和工具中行为不一致（特别是 `!` 否定语法）。最终选择 rsync `--exclude` + 防御性 `rm` 双重保障——rsync 负责主过滤，`rm` 作为安全兜底，100% 可靠可审计。

### 坑 2：PAT 命令格式

```bash
# ❌ 错误：把 token 当成了 secret name
gh secret set github_pat_xxx --repo org/project-dev

# ✅ 正确：token 通过 stdin 传入
echo "github_pat_xxx" | gh secret set PUBLIC_REPO_PAT --repo org/project-dev
```

### 坑 3：先排除再考虑测试依赖

排除 `docs/` 后才发现单元测试的 test vectors JSON 文件在 `docs/implementation/test-vectors/` 里。公开仓库 CI 全部失败。教训：**排除任何目录前，先 `grep -r` 搜索是否有其他地方引用了该目录下的文件**。

```bash
# 排除前先检查
grep -rn "docs/implementation" packages/ scripts/ --include='*.ts' --include='*.js'
```

### 坑 4：Copilot 指令中的凭据

`.github/copilot-instructions.md` 通常包含数据库密码、API key、SSH 地址等（方便 agent 操作）。如果直接同步到公开仓库会泄露所有凭据。必须维护单独的 `.public.md` 版本。

### 坑 5：公开仓库的 CI workflow 也需要同步

公开仓库中的 `ci.yml`、`release.yml` 等来自私有仓库的同步。如果在 workflow 文件中有变更（比如添加 `provenance: false`），PAT 需要 `workflow` 权限才能 push 成功。

### 坑 6：不要忘记 tag 同步

用户 `npm install project@1.2.3` 需要公开仓库有对应的 `v1.2.3` tag。workflow 中需要处理 tag push 事件并同步 tag 到公开仓库。

### 坑 7：从 force-push 切换到增量同步

如果公开仓库之前用的是 force-push 单 commit 模式（只有一个 `sync: xxx` commit），切换到 rsync 增量模式时第一次 push 可能遇到 "unrelated histories" 问题。解决方案：

1. 首次切换时手动清空公开仓库（删除 main 分支后重新 init），让第一次增量同步成为新的起点
2. 或在 workflow 中加一个一次性的 `--force` push 做过渡，之后改回普通 push

### 坑 8：rsync 排除整个父目录后需要单独同步子目录

如果用 `--exclude='docs'` 排除了整个 `docs/` 目录，但其中 `docs/api/` 或 `docs/guides/` 这类子目录需要公开，必须在 rsync 之后用单独命令同步这些子目录。只有这些路径真实存在时才需要这一步：

```bash
# docs 整体排除后，单独同步公开部分
mkdir -p /tmp/public-repo/docs
rsync -a --delete docs/api/ /tmp/public-repo/docs/api/
```

不能用 rsync 的 `--include` + `--exclude` 组合来实现（语法复杂且容易出错）。

---

## 6. 文件清单

实施完成后，私有仓库应包含以下新增/修改文件：

| 文件 | 作用 |
|------|------|
| `LICENSE` | 开源许可证（Apache-2.0 / MIT） |
| `.public-sync-ignore` | 排除路径清单（信息性） |
| `.github/copilot-instructions.public.md` | 脱敏版 copilot 指令 |
| `.github/workflows/sync-public.yml` | 同步 workflow |

私有仓库 Settings → Secrets 中应有：

| Secret | 作用 |
|--------|------|
| `PUBLIC_REPO_PAT` | Fine-grained PAT，对公开仓库有 Contents + Workflows 写权限 |

---

## 7. 安全检查清单

- [ ] 公开仓库保留增量 git 历史（commit message 不含敏感信息）
- [ ] 所有生产凭据已从代码中移除或已在排除列表中
- [ ] secret scan 中包含所有已知敏感值的唯一片段
- [ ] `.github/copilot-instructions.md` 公开版不含任何凭据/服务器信息
- [ ] 开发用私钥均为标准开发账号（公开安全），生产私钥仅在 .env.cloud（不在 git 中）
- [ ] 如果仓库曾经是 public，所有暴露过的凭据已轮换
- [ ] PAT 权限最小化（仅 Contents + Workflows，仅限公开仓库）
- [ ] 同步 workflow 在 push to main（非工作时间）时自动触发
- [ ] 时间门控正常工作（08:00-19:00 CST 跳过，手动 dispatch 始终放行）
- [ ] tag 同步正常工作（按版本策略设置触发器，例如 CalVer 用 `20*`，SemVer 用 `v*`）
- [ ] rsync 排除列表 + 防御性 `rm` 双重保障无遗漏
