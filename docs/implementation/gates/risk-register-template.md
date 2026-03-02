# TelAgent v1 风险清单模板

- 用途：Phase Gate 评审时统一登记风险与阻塞，支持跨阶段追踪。
- 更新要求：每次 Gate 前后必须更新一次。

| 风险 ID | 风险描述 | 影响范围 | 缓解措施 | Owner | 截止日期 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| RISK-PX-001 | `<risk>` | `<impact>` | `<mitigation>` | `<owner>` | `YYYY-MM-DD` | Open/Closed |

## 填写规则

1. `影响范围` 必须明确到功能或阶段（如：Phase 1 部署、Phase 2 API 契约）。
2. `缓解措施` 必须可执行且可验收，禁止“持续关注”类表述。
3. `Owner` 必须是单一责任人。
4. `状态=Closed` 时需补充关闭证据（PR、测试记录或 Gate 结论链接）。
