# TA-P13-002 规模压测升级（消息+会话）（2026-03-03）

- Task ID：TA-P13-002
- 阶段：Phase 13
- 状态：DONE
- 负责人角色：Backend + SRE + QA

## 1. 目标

在 Phase 12 基线之上，增加消息通道规模压测深度，验证高会话并发下的投递吞吐、时延、序号与去重语义。

## 2. 实现

- 新增脚本：`packages/node/scripts/run-phase13-scale-load-check.ts`
- 场景参数：
  - `totalConversations=40`
  - `messagesPerConversation=80`
  - `totalMessages=3200`
- 校验项：
  - 会话内 `seq` 单调；
  - 相同 `envelopeId` 幂等复用；
  - 同 `envelopeId` 异 payload 冲突拒绝；
  - 吞吐与 P95 时延达到门槛。

## 3. 结果

- 吞吐：`14074.78 msg/s`
- P95 时延：`0.111 ms`
- 结论：`PASS`

## 4. 证据

- 脚本：`packages/node/scripts/run-phase13-scale-load-check.ts`
- 日志：`docs/implementation/phase-13/logs/2026-03-03-p13-scale-load-check-run.txt`
- 清单：`docs/implementation/phase-13/manifests/2026-03-03-p13-scale-load-check.json`

## 5. 结论

- `TA-P13-002`：PASS
- 当前负载窗口下消息通道核心语义未退化，满足 Phase 13 稳定化目标。
