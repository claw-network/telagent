# TA-P17-003 双节点云端聊天联调检查（2026-03-04）

- Task ID：TA-P17-003
- 状态：IN_PROGRESS
- 日期：2026-03-04

## 目标

在两台独立云节点上验证跨节点自动投递闭环：

- A -> B 可达
- B -> A 可达
- 输出机读报告用于 Gate 收口

## 已完成

- 联调脚本已实现：`packages/node/scripts/run-cross-node-chat-check.ts`
- README/runbook 已补齐：`README.md`, `README_CN.md`, `docs/implementation/phase-17/README.md`
- 报告输出路径已固定：`docs/implementation/phase-17/cross-node-chat-check-report.json`

## 待完成

- 在真实双云节点执行脚本并归档报告
- 将报告结果同步到 Gate 文档

## 运行命令

```bash
pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts
```

## 阻塞

- 缺少双云节点统一联调窗口与环境变量注入。
