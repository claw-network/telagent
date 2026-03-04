# TelAgent v1 接手提示词（2026-03-04）

> 用途：给下一位 agent 直接粘贴，快速接手后续开发。

## 可直接复制的提示词

你现在接手 **TelAgent v1** 项目（接手日期：2026-03-04，工作目录：`/Users/xiasenhai/Workspace/OpenClaw/telagent`）。

### 1) 当前项目状态（先确认）
- 分支：`main`
- 近期关键提交（已推送）：
  - `1cc3e45` `refactor(console): rename workspace package path to packages/console`
  - `88608f1` `chore(console): unify naming across docs evidence and checks`
  - `e25e760` `chore(console): rename web app runtime naming to console`
  - `75e1549` `feat(phase-16): complete TA-P16-005~007 and close gate`
- 阶段状态：
  - Phase 0 ~ Phase 16：全部 `PASS` 且已关闭
  - 当前无进行中执行阶段（后续任务需先立项并按 Gate 流程推进）
- 工作区要求：开始前确认 `git status --short` 必须 clean。

### 2) 强约束（必须持续遵守）
- API 前缀只允许：`/api/v1/*`
- DID 只允许：`did:claw:*`
- DID hash 固定：`keccak256(utf8(did))`
- 错误响应必须：RFC7807（`application/problem+json`）
- 未经 Gate 结论不得切换阶段
- Gate 记录统一写入：`docs/implementation/gates/phase-x-gate.md`

### 3) 目录与命名基线（非常重要）
- Console 包路径已正式切换为：`packages/console`
- 包名为：`@telagent/console`
- 旧路径 `packages/web` 已下线，不要再新增该路径引用

### 4) 先读文档（固定顺序）
1. `docs/README.md`
2. `docs/design/telagent-v1-design.md`
3. `docs/implementation/telagent-v1-implementation-plan.md`
4. `docs/implementation/telagent-v1-task-breakdown.md`
5. `docs/implementation/telagent-v1-iteration-board.md`
6. `docs/implementation/phase-16/README.md`
7. `docs/implementation/gates/phase-16-gate.md`
8. `docs/implementation/release/README.md`（如需做发布相关工作）

### 5) 基线验证命令（接手后立即执行）
- `git pull`
- `corepack pnpm --filter @telagent/node build`
- `corepack pnpm --filter @telagent/node test`
- `corepack pnpm --filter @telagent/console typecheck`
- `corepack pnpm --filter @telagent/console build`
- `corepack pnpm --filter @telagent/console test`
- `corepack pnpm --filter @telagent/console run check:phase16:006`
- `corepack pnpm --filter @telagent/console run check:phase16:007`

### 6) 本轮执行目标（你需要先完成这一步）
你先不要直接编码新功能，先完成以下“接手健康检查”并产出证据：
1. 确认 `packages/console` 路径与 `@telagent/console` 脚本链路全部可用；
2. 确认核心约束（`/api/v1/*`、DID、RFC7807）在 Console 与 Node 侧未回归；
3. 给出下一阶段（建议命名 Phase 17）候选任务清单（按 P0/P1/P2 分级），并写明每项验收标准；
4. 在 WBS 和 iteration board 中新增“候选任务占位条目（不改阶段结论）”；
5. 输出一份接手检查 manifest（json）和日志文件，路径放到 `docs/implementation/phase-17/`（如果目录不存在请创建）。

### 7) 证据输出规范
- 文档：`docs/implementation/phase-17/ta-p17-xxx-*.md`
- 日志：`docs/implementation/phase-17/logs/*.txt`
- 清单：`docs/implementation/phase-17/manifests/*.json`
- 每一项任务必须可追踪到：代码文件 + 日志 + manifest + 文档结论

### 8) 回报格式（严格遵守）
1. Task ID
2. 状态（TODO / IN_PROGRESS / BLOCKED / DONE）
3. 证据链接（文档路径 / 提交 hash / 测试日志）
4. 阻塞项
5. 下一步动作

### 9) 执行风格要求
- 直接执行，不停留在空计划
- 不跳步骤，不跨 Gate
- 变更后必须有可验证证据
- 完成后提交并 push，并回报 commit hash

## 给接手者的额外上下文
- Phase 16 Gate 已 `PASS`，允许进入下一阶段，但下一阶段内容需要先立项与前置 Gate 检查。
- Console 命名与证据链已统一；继续开发请沿用 `console` 命名，不要引入 `web app` 的旧称。
