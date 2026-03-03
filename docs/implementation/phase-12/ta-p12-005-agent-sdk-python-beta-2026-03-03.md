# TA-P12-005 Agent SDK Python Beta（2026-03-03）

- Task ID：TA-P12-005
- 阶段：Phase 12（v1.2 候选能力冻结与排程）
- 状态：DONE
- 负责人角色：DX + Backend

## 1. 目标

交付可直接接入的 Python SDK Beta，满足“30 分钟内完成建群与发消息集成”的最小验收目标，并保持既有协议约束：

1. API 访问固定 `/api/v1/*`；
2. RFC7807（`application/problem+json`）错误可结构化抛出；
3. 快速接入主路径覆盖建群、发消息、拉消息。

## 2. 实现范围

### 2.1 新增 Python SDK 包

- 新增目录：`packages/sdk-python`
- 新增文件：
  - `packages/sdk-python/pyproject.toml`
  - `packages/sdk-python/README.md`
  - `packages/sdk-python/telagent_sdk/__init__.py`
  - `packages/sdk-python/telagent_sdk/client.py`

### 2.2 SDK 能力边界（Beta）

- `TelagentSdk`：
  - `create_group(...)`
  - `send_message(...)`
  - `pull_messages(...)`
  - `get_self_identity()` / `get_identity(...)`
- `TelagentSdkError`：
  - 将 RFC7807 错误映射为异常，暴露 `status` 与 `problem`。
- 兼容处理：
  - 将消息 `seq` 从 JSON string 自动还原为 Python `int`；
  - 请求查询参数与 JSON body 统一编码；
  - 基础超时与 token header 支持。

### 2.3 自动化验证与脚本化验收

- 单测：
  - `packages/sdk-python/tests/test_client.py`
  - 覆盖 quickstart 主链路与 RFC7807 错误映射。
- 专项脚本：
  - `packages/sdk-python/scripts/run_phase12_python_sdk_quickstart_check.py`
  - 输出机读清单：`docs/implementation/phase-12/manifests/2026-03-03-p12-python-sdk-quickstart-check.json`

## 3. 执行命令

```bash
python3 -m compileall packages/sdk-python/telagent_sdk
PYTHONPATH=packages/sdk-python python3 -m unittest discover -s packages/sdk-python/tests -p 'test_*.py'
PYTHONPATH=packages/sdk-python python3 packages/sdk-python/scripts/run_phase12_python_sdk_quickstart_check.py
```

## 4. 证据

- 代码：
  - `.gitignore`
  - `packages/sdk-python/pyproject.toml`
  - `packages/sdk-python/README.md`
  - `packages/sdk-python/telagent_sdk/__init__.py`
  - `packages/sdk-python/telagent_sdk/client.py`
  - `packages/sdk-python/tests/test_client.py`
  - `packages/sdk-python/scripts/run_phase12_python_sdk_quickstart_check.py`
- 日志：
  - `docs/implementation/phase-12/logs/2026-03-03-p12-sdk-python-build.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-sdk-python-test.txt`
  - `docs/implementation/phase-12/logs/2026-03-03-p12-python-sdk-quickstart-check-run.txt`
- 清单：
  - `docs/implementation/phase-12/manifests/2026-03-03-p12-python-sdk-quickstart-check.json`

## 5. 结论

- `TA-P12-005`：PASS
- Python SDK Beta 已可覆盖建群与消息主链路，并具备脚本化、机读化验收证据。
