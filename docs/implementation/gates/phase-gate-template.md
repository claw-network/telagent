# TelAgent v1 Phase Gate 模板

- Phase：`Phase X`
- Gate 编号：`TA-GATE-PX`
- 评审日期：`YYYY-MM-DD`
- 主持人（TL）：`<name>`
- 参与人：`<PO/CE/BE/SE/QA/SRE/FE>`
- 结论：`PASS | CONDITIONAL PASS | FAIL`

## 1) 输入物检查

- [ ] 本阶段实施任务完成清单（WBS 状态）已更新
- [ ] 本阶段测试报告已归档
- [ ] 风险清单已更新
- [ ] 缺陷清单（含 P0/P1 状态）已更新
- [ ] 回滚或应急方案（如适用）已验证

## 2) Exit Criteria 核对

在下表中填写“通过/不通过/不适用”与证据路径。

| 条目 | 结果 | 证据路径 | 备注 |
| --- | --- | --- | --- |
| Exit-1 | 通过/不通过/不适用 | `<path>` |  |
| Exit-2 | 通过/不通过/不适用 | `<path>` |  |
| Exit-3 | 通过/不通过/不适用 | `<path>` |  |

## 3) 风险与阻塞

> 维护方式建议：先复制 `docs/implementation/gates/risk-register-template.md`，再回填本表。

| 风险/阻塞 | 影响 | Owner | 截止日期 | 状态 |
| --- | --- | --- | --- | --- |
| `<item>` | `<impact>` | `<owner>` | `YYYY-MM-DD` | Open/Closed |

## 4) 条件放行补丁项（仅 CONDITIONAL PASS 填写）

| 补丁项 | Owner | 截止日期 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- |
| `<patch>` | `<owner>` | `YYYY-MM-DD` | `<criteria>` | TODO |

## 5) 结论说明

- 决策摘要：`<one paragraph>`
- 是否允许进入下一阶段：`YES/NO`
- 下一次复核时间（如需）：`YYYY-MM-DD HH:mm`

## 6) 签字

- TL：`<name/date>`
- Phase Owner：`<name/date>`
- QA：`<name/date>`
