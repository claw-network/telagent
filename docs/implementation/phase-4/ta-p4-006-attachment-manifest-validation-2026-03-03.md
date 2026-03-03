# TA-P4-006 附件 init/complete 与清单校验（2026-03-03）

- Task ID：TA-P4-006
- 阶段：Phase 4
- 状态：DONE
- 负责人角色：Backend Engineer

## 1. 目标

补齐附件上传流程的会话校验与清单一致性校验，确保 `init-upload` / `complete-upload` 具备可验证、可幂等行为。

## 2. 实现

- 附件服务增强：`packages/node/src/services/attachment-service.ts`
  - 新增 upload session 过期时间（默认 900 秒）
  - 新增文件名安全化处理（防路径穿越和非法字符）
  - 强制 `objectKey` 前缀为 `attachments/`
  - 强制 `checksum` 为 32-byte hex
  - `complete-upload` 支持幂等完成：同 checksum 重放返回同结果
  - 已完成会话若 checksum 不一致返回 `CONFLICT`
  - 过期会话不可完成，返回 `NOT_FOUND`（被清理后）
- 协议校验增强：`packages/protocol/src/schema.ts`
  - `CompleteAttachmentSchema.checksum` 从一般 hex 收敛为 `bytes32`
- API 契约测试联动：`packages/node/src/api-contract.test.ts`
  - 调整 `complete-upload` 示例 checksum 为 bytes32
- 新增单测：`packages/node/src/services/attachment-service.test.ts`
  - init 文件名安全化
  - manifest/checksum 校验
  - 完成幂等与冲突行为
  - 过期会话清理与拒绝完成

## 3. 验证结果

- Node 构建日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-build.txt`
- Node 测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-node-test.txt`
- 全仓测试日志：`docs/implementation/phase-4/logs/2026-03-03-p4-workspace-test.txt`
- 结论：附件上传流程具备 manifest/checksum 一致性校验与可重复提交幂等语义。

## 4. 下一步

推进 `TA-P4-007`（联邦接口鉴权/限流/重试）与 `TA-P4-008`（node-info 域名一致性校验）。
