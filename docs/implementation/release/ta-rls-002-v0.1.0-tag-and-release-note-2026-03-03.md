# TA-RLS-002 `v0.1.0` 标签发布与 Release Note（2026-03-03）

- Task ID：TA-RLS-002
- 阶段：Release Execution
- 状态：DONE
- 负责人角色：Release Owner / TL

## 1. 执行结果

- 已创建 annotated tag：`v0.1.0`
- tag message：`TelAgent v1 MVP`
- tag 指向 commit：`199d46f1fc93b1005768fd65c012bf77a6397df0`
- 已推送到远端：`origin/v0.1.0`

## 2. 发布说明（Release Notes）

### 2.1 关键能力

1. 完成 Phase 0~5 全部交付并通过 Gate。
2. 保持协议强约束：
   - API 前缀仅 `/api/v1/*`
   - DID 命名空间仅 `did:claw:*`
   - DID hash 固定 `keccak256(utf8(did))`
   - 错误响应固定 RFC7807
3. 群组链上生命周期 + 消息链下 E2EE 投递闭环完成（含去重/有序/离线 TTL）。
4. 联邦接口完成鉴权、限流、域名一致性校验。

### 2.2 验收摘要

- Phase 5 Gate：`PASS`
- Readiness：`GO`
- 安全评审：`10/10 PASS`，`critical/high open = 0`
- 故障注入：`3/3 PASS`
- 发布前置检查：`6/6 PASS`，`READY_FOR_TAG`

## 3. 证据

- tag 推送日志：`docs/implementation/release/logs/2026-03-03-v0.1.0-tag-push.txt`
- tag 清单：`docs/implementation/release/manifests/2026-03-03-v0.1.0-release-tag.json`
- preflight 清单：`docs/implementation/release/manifests/2026-03-03-v0.1.0-release-preflight.json`
- Phase 5 Gate：`docs/implementation/gates/phase-5-gate.md`

## 4. 后续

- 进入 Phase 6 风险整改优先项：离线邮箱持久化与多实例扩展。
