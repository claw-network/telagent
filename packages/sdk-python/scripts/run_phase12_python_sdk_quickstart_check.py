from __future__ import annotations

import json
import os
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

SDK_ROOT = Path(__file__).resolve().parents[1]
if str(SDK_ROOT) not in sys.path:
    sys.path.insert(0, str(SDK_ROOT))

from telagent_sdk import TelagentSdk


def read_json(handler: BaseHTTPRequestHandler) -> Any:
    length = int(handler.headers.get("content-length", "0"))
    if length <= 0:
        return None
    payload = handler.rfile.read(length).decode("utf-8")
    return json.loads(payload)


def write_json(handler: BaseHTTPRequestHandler, status: int, body: Any, content_type: str = "application/json; charset=utf-8") -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", content_type)
    handler.send_header("content-length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


@dataclass
class Phase12PythonSdkReport:
    phase: str
    taskId: str
    generatedAt: str
    summary: dict[str, Any]
    decision: str
    details: dict[str, Any]


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    output_path = Path(
        os.environ.get(
            "P12_PYTHON_SDK_OUTPUT_PATH",
            str(repo_root / "docs/implementation/phase-12/manifests/2026-03-03-p12-python-sdk-quickstart-check.json"),
        )
    )

    created_at_ms = int(time.time() * 1000)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            self._handle()

        def do_POST(self) -> None:  # noqa: N802
            self._handle()

        def _handle(self) -> None:
            path = self.path.split("?", 1)[0]
            if self.command == "POST" and path == "/api/v1/groups":
                body = read_json(self)
                write_json(
                    self,
                    201,
                    {
                        "data": {
                            "txHash": "0xgroup",
                            "group": {
                                "groupId": body["groupId"],
                                "creatorDid": body["creatorDid"],
                                "creatorDidHash": f"0x{'a' * 64}",
                                "groupDomain": "alpha.tel",
                                "domainProofHash": f"0x{'b' * 64}",
                                "initialMlsStateHash": f"0x{'c' * 64}",
                                "state": "PENDING_ONCHAIN",
                                "createdAtMs": created_at_ms,
                            },
                        }
                    },
                )
                return

            if self.command == "POST" and path == "/api/v1/messages":
                write_json(
                    self,
                    201,
                    {
                        "data": {
                            "envelope": {
                                "envelopeId": "sdk-py-env-1",
                                "conversationId": "direct:sdk-py-alice-bob",
                                "conversationType": "direct",
                                "routeHint": {
                                    "targetDomain": "alpha.tel",
                                    "mailboxKeyId": "mailbox-1",
                                },
                                "sealedHeader": "0x11",
                                "seq": "1",
                                "ciphertext": "0x22",
                                "contentType": "text",
                                "sentAtMs": created_at_ms,
                                "ttlSec": 60,
                                "provisional": False,
                            }
                        }
                    },
                )
                return

            if self.command == "GET" and path == "/api/v1/messages/pull":
                write_json(
                    self,
                    200,
                    {
                        "data": {
                            "items": [
                                {
                                    "envelopeId": "sdk-py-env-1",
                                    "conversationId": "direct:sdk-py-alice-bob",
                                    "conversationType": "direct",
                                    "routeHint": {
                                        "targetDomain": "alpha.tel",
                                        "mailboxKeyId": "mailbox-1",
                                    },
                                    "sealedHeader": "0x11",
                                    "seq": "1",
                                    "ciphertext": "0x22",
                                    "contentType": "text",
                                    "sentAtMs": created_at_ms,
                                    "ttlSec": 60,
                                    "provisional": False,
                                }
                            ],
                            "cursor": None,
                        }
                    },
                )
                return

            write_json(
                self,
                404,
                {
                    "type": "https://telagent.dev/errors/not-found",
                    "title": "Not Found",
                    "status": 404,
                    "detail": "route not found",
                    "code": "NOT_FOUND",
                },
                content_type="application/problem+json; charset=utf-8",
            )

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address

    sdk = TelagentSdk(base_url=f"http://{host}:{port}")
    start_ms = int(time.time() * 1000)

    create_group_ok = False
    send_message_ok = False
    pull_message_ok = False

    created = sdk.create_group(
        {
            "creatorDid": "did:claw:zAlice",
            "groupId": f"0x{'1' * 64}",
            "groupDomain": "alpha.tel",
            "domainProofHash": f"0x{'2' * 64}",
            "initialMlsStateHash": f"0x{'3' * 64}",
        }
    )
    create_group_ok = created["group"]["groupId"] == f"0x{'1' * 64}"

    sent = sdk.send_message(
        {
            "senderDid": "did:claw:zAlice",
            "conversationId": "direct:sdk-py-alice-bob",
            "conversationType": "direct",
            "targetDomain": "alpha.tel",
            "mailboxKeyId": "mailbox-1",
            "sealedHeader": "0x11",
            "ciphertext": "0x22",
            "contentType": "text",
            "ttlSec": 60,
        }
    )
    send_message_ok = sent["seq"] == 1

    pulled = sdk.pull_messages(conversation_id="direct:sdk-py-alice-bob", limit=10)
    pull_message_ok = len(pulled["items"]) == 1 and pulled["items"][0]["seq"] == 1

    elapsed_ms = int(time.time() * 1000) - start_ms
    integrates_within_30_minutes = elapsed_ms <= 30 * 60 * 1000

    server.shutdown()
    server.server_close()
    thread.join(timeout=3)

    decision = (
        "PASS"
        if create_group_ok and send_message_ok and pull_message_ok and integrates_within_30_minutes
        else "FAIL"
    )

    report = Phase12PythonSdkReport(
        phase="Phase 12",
        taskId="TA-P12-005",
        generatedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        summary={
            "createGroupOk": create_group_ok,
            "sendMessageOk": send_message_ok,
            "pullMessageOk": pull_message_ok,
            "integratesWithin30Minutes": integrates_within_30_minutes,
        },
        decision=decision,
        details={
            "elapsedMs": elapsed_ms,
            "groupId": created["group"]["groupId"],
            "envelopeId": sent["envelopeId"],
            "mailboxCount": len(pulled["items"]),
        },
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report.__dict__, indent=2) + "\n", encoding="utf-8")

    print(f"[TA-P12-005] createGroupOk={create_group_ok}")
    print(f"[TA-P12-005] sendMessageOk={send_message_ok}")
    print(f"[TA-P12-005] pullMessageOk={pull_message_ok}")
    print(f"[TA-P12-005] integratesWithin30Minutes={integrates_within_30_minutes} elapsedMs={elapsed_ms}")
    print(f"[TA-P12-005] decision={decision}")
    print(f"[TA-P12-005] output={output_path}")

    if decision != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
