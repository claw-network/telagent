# TA-P0-002 冻结成功/错误 Envelope 规范

- Task ID：TA-P0-002
- 负责人角色：Protocol Owner
- 状态：DONE
- 冻结日期：2026-03-02

## 1. 成功响应 Envelope（固定）

## 1.1 单资源

```json
{
  "data": {
    "id": "..."
  },
  "links": {
    "self": "/api/v1/..."
  }
}
```

## 1.2 列表资源

```json
{
  "data": [
    {
      "id": "..."
    }
  ],
  "meta": {
    "pagination": {
      "nextCursor": "..."
    }
  },
  "links": {
    "self": "/api/v1/..."
  }
}
```

## 1.3 创建成功

- HTTP 状态：`201 Created`
- 必须返回 `Location` 头
- `Location` 值必须与 `links.self` 指向同一资源

## 2. 错误响应 Envelope（RFC7807 固定）

- `Content-Type: application/problem+json`
- 结构固定字段：
  - `type`（URI）
  - `title`
  - `status`
  - `detail`
  - `instance`
- 扩展字段：
  - `code`（TelAgent 错误码）

示例：

```json
{
  "type": "https://telagent.dev/errors/validation-error",
  "title": "Bad Request",
  "status": 400,
  "detail": "groupId must be bytes32 hex string",
  "instance": "/api/v1/groups",
  "code": "VALIDATION_ERROR"
}
```

## 3. 不允许项

1. 错误响应返回非 RFC7807 的任意自定义结构。
2. 成功响应返回裸数组/裸对象（无 `data` 包裹）。
3. `instance` 指向非 `/api/v1/*` 路径。

## 4. 证据

- 设计文档响应章节：`docs/design/telagent-v1-design.md`（11.4, 11.5）
- 错误码字典：`docs/implementation/phase-0/ta-p0-003-error-code-dictionary.md`
