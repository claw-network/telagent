# TA-P11-003 DomainProof 自动挑战与过期轮转（2026-03-03）

- Task ID：TA-P11-003
- 阶段：Phase 11（v1.1 安全与运营能力增强）
- 状态：DONE
- 负责人角色：Security / Backend

## 1. 目标

为 `createGroup` 链路补齐 DomainProof v1.1 安全增强：

1. 自动校验 `.well-known` 域名证明文档与 `node-info` 一致性；
2. 通过 `nonce + expiresAt` 驱动挑战状态，接近过期时强制轮转；
3. 对非法域名挑战、哈希冲突、过期未轮转等场景返回标准 RFC7807 错误。

## 2. 实现

### 2.1 DomainProofChallengeService

- 新增：`packages/node/src/services/domain-proof-challenge-service.ts`
- 能力：
  - 校验 `groupId/groupDomain/creatorDid/domainProofHash` 入参；
  - 拉取证明文档：`https://{groupDomain}/.well-known/telagent/group-proof/{groupId}.json`；
  - 校验最小字段集与时间窗口（`issuedAt < expiresAt` 且未过期）；
  - 拉取并校验 `nodeInfoUrl`，要求路径固定 `/api/v1/federation/node-info` 且域名一致；
  - 使用 canonical JSON 计算 `keccak256(utf8(json))`，校验 `domainProofHash`；
  - 维护 challenge 状态并在接近过期窗口（`rotateBeforeExpirySec`）强制 nonce 轮转。

### 2.2 createGroup 接入

- 更新：`packages/node/src/services/group-service.ts`
  - 在上链交易前接入 DomainProofChallengeService 校验。
- 更新：`packages/node/src/app.ts`
  - Node 启动时注入 DomainProofChallengeService。

### 2.3 配置与运行时

- 更新：`packages/node/src/config.ts`
  - 新增 `domainProof` 配置块：
    - `mode`: `enforced | report-only`
    - `challengeTtlSec`
    - `rotateBeforeExpirySec`
    - `requestTimeoutMs`
- 更新：`packages/node/src/config.test.ts`
  - 覆盖默认值、report-only、自定义值、非法 mode、非法数值。
- 更新：`.env.example`
  - 增加 Phase 11 DomainProof 配置示例。

### 2.4 测试与脚本

- 新增单测：`packages/node/src/services/domain-proof-challenge-service.test.ts`
  - 合法挑战通过；
  - 非法域名挑战拒绝；
  - canonical hash 不一致拒绝；
  - 过期窗口内 nonce 不轮转拒绝，轮转后通过；
  - report-only 仅告警不阻断。
- 新增脚本：`packages/node/scripts/run-phase11-domain-proof-challenge-check.ts`
  - 输出机读清单：
    - `illegalDomainRejected`
    - `validChallengeAccepted`
    - `staleNonceRejected`
    - `rotatedNonceAccepted`
    - `canonicalHashMatched`

## 3. 执行命令

```bash
pnpm --filter @telagent/node build
pnpm --filter @telagent/node test
pnpm --filter @telagent/node exec tsx scripts/run-phase11-domain-proof-challenge-check.ts
```

## 4. 证据

- 代码：
  - `packages/node/src/services/domain-proof-challenge-service.ts`
  - `packages/node/src/services/domain-proof-challenge-service.test.ts`
  - `packages/node/src/services/group-service.ts`
  - `packages/node/src/app.ts`
  - `packages/node/src/config.ts`
  - `packages/node/src/config.test.ts`
  - `packages/node/scripts/run-phase11-domain-proof-challenge-check.ts`
  - `.env.example`
- 日志：
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-build.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-node-test.txt`
  - `docs/implementation/phase-11/logs/2026-03-03-p11-domain-proof-challenge-check-run.txt`
- 清单：
  - `docs/implementation/phase-11/manifests/2026-03-03-p11-domain-proof-challenge-check.json`

## 5. 结论

- `TA-P11-003`：PASS
- 非法域名挑战已被拒绝，合法域名在过期窗口内完成 nonce 轮转后可续期通过。
