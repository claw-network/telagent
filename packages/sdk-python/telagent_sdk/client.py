from __future__ import annotations

import json
from http import HTTPStatus
from typing import Any, Mapping, MutableMapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

JsonObject = dict[str, Any]


class TelagentSdkError(Exception):
    def __init__(self, problem: Mapping[str, Any], status: int | None = None) -> None:
        self.problem: JsonObject = dict(problem)
        inferred_status = self.problem.get("status")
        if status is not None:
            self.status = int(status)
        elif isinstance(inferred_status, int):
            self.status = inferred_status
        else:
            self.status = 0

        detail = self.problem.get("detail")
        title = self.problem.get("title")
        message = detail if isinstance(detail, str) and detail else title
        if not isinstance(message, str) or not message:
            message = f"Telagent API request failed (status={self.status})"
        super().__init__(message)


class TelagentSdk:
    def __init__(
        self,
        *,
        base_url: str,
        access_token: str | None = None,
        timeout_sec: float = 10.0,
        default_headers: Mapping[str, str] | None = None,
    ) -> None:
        self._base_url = self._normalize_base_url(base_url)
        self._access_token = access_token
        self._timeout_sec = timeout_sec
        self._default_headers: dict[str, str] = {
            "accept": "application/json",
        }
        if default_headers:
            self._default_headers.update(default_headers)

    def get_self_identity(self) -> JsonObject:
        return self._request_data("GET", "/api/v1/identities/self")

    def get_identity(self, did: str) -> JsonObject:
        return self._request_data("GET", f"/api/v1/identities/{did}")

    def create_group(self, payload: Mapping[str, Any]) -> JsonObject:
        return self._request_data("POST", "/api/v1/groups", payload=payload)

    def send_message(self, payload: Mapping[str, Any]) -> JsonObject:
        data = self._request_data("POST", "/api/v1/messages", payload=payload)
        envelope_raw = self._require_mapping(data.get("envelope"), "response.data.envelope")
        return self._hydrate_envelope(envelope_raw)

    def pull_messages(
        self,
        *,
        cursor: str | None = None,
        limit: int | None = None,
        conversation_id: str | None = None,
    ) -> JsonObject:
        query: dict[str, Any] = {
            "cursor": cursor,
            "limit": limit,
            "conversation_id": conversation_id,
        }
        data = self._request_data("GET", "/api/v1/messages/pull", query=query)
        items_raw = data.get("items")
        if not isinstance(items_raw, list):
            raise ValueError("response.data.items must be an array")

        items = [self._hydrate_envelope(self._require_mapping(item, f"response.data.items[{index}]")) for index, item in enumerate(items_raw)]
        return {
            "items": items,
            "cursor": data.get("cursor"),
        }

    def _request_data(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
        query: Mapping[str, Any] | None = None,
    ) -> JsonObject:
        response_body = self._request(method, path, payload=payload, query=query)
        envelope = self._require_mapping(response_body, "response")
        data = self._require_mapping(envelope.get("data"), "response.data")
        return data

    def _request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
        query: Mapping[str, Any] | None = None,
    ) -> Any:
        url = self._build_url(path, query)
        headers = dict(self._default_headers)
        if self._access_token:
            headers["authorization"] = f"Bearer {self._access_token}"

        body_bytes: bytes | None = None
        if payload is not None:
            body_bytes = json.dumps(payload).encode("utf-8")
            headers["content-type"] = "application/json"

        request = Request(url=url, method=method.upper(), headers=headers, data=body_bytes)
        try:
            with urlopen(request, timeout=self._timeout_sec) as response:
                raw = response.read()
                if not raw:
                    return None
                decoded = raw.decode("utf-8")
                if not decoded.strip():
                    return None
                return json.loads(decoded)
        except HTTPError as error:
            raw = error.read()
            content_type = error.headers.get("content-type", "")
            parsed = self._parse_json(raw)
            if self._is_problem_response(content_type, parsed):
                problem = parsed if isinstance(parsed, dict) else {}
                if "status" not in problem:
                    problem["status"] = error.code
                if "title" not in problem:
                    problem["title"] = HTTPStatus(error.code).phrase
                raise TelagentSdkError(problem, status=error.code) from error

            raise RuntimeError(f"Telagent API request failed with HTTP {error.code}") from error
        except URLError as error:
            raise RuntimeError(f"Telagent API request failed: {error.reason}") from error

    def _build_url(self, path: str, query: Mapping[str, Any] | None = None) -> str:
        normalized_path = path[1:] if path.startswith("/") else path
        url = urljoin(self._base_url, normalized_path)
        query_pairs: list[tuple[str, str]] = []
        if query:
            for key, value in query.items():
                if value is None:
                    continue
                if isinstance(value, bool):
                    rendered = "true" if value else "false"
                else:
                    rendered = str(value)
                query_pairs.append((key, rendered))
        if query_pairs:
            return f"{url}?{urlencode(query_pairs)}"
        return url

    @staticmethod
    def _normalize_base_url(base_url: str) -> str:
        trimmed = base_url.strip()
        if not trimmed:
            raise ValueError("TelagentSdk requires a non-empty base_url")
        return trimmed if trimmed.endswith("/") else f"{trimmed}/"

    @staticmethod
    def _parse_json(raw: bytes) -> Any:
        if not raw:
            return None
        text = raw.decode("utf-8")
        if not text.strip():
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _is_problem_response(content_type: str, payload: Any) -> bool:
        if "application/problem+json" in content_type:
            return True
        if not isinstance(payload, dict):
            return False
        return any(key in payload for key in ("type", "title", "status", "code", "detail"))

    @staticmethod
    def _require_mapping(value: Any, field_name: str) -> MutableMapping[str, Any]:
        if not isinstance(value, MutableMapping):
            raise ValueError(f"{field_name} must be an object")
        return value

    @staticmethod
    def _hydrate_envelope(raw: Mapping[str, Any]) -> JsonObject:
        envelope = dict(raw)
        seq = envelope.get("seq")
        if isinstance(seq, str):
            if not seq.isdigit():
                raise ValueError("response.data.envelope.seq must be a non-negative integer string")
            envelope["seq"] = int(seq)
        elif isinstance(seq, int):
            if seq < 0:
                raise ValueError("response.data.envelope.seq must be non-negative")
        else:
            raise ValueError("response.data.envelope.seq must be a string or integer")
        return envelope
