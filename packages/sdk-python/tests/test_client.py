from __future__ import annotations

import json
import sys
import threading
import unittest
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

SDK_ROOT = Path(__file__).resolve().parents[1]
if str(SDK_ROOT) not in sys.path:
    sys.path.insert(0, str(SDK_ROOT))

from telagent_sdk import TelagentSdk, TelagentSdkError


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
class ServerHarness:
    server: ThreadingHTTPServer
    thread: threading.Thread
    base_url: str
    seen_paths: list[str] = field(default_factory=list)

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)


def start_server(router: Callable[[BaseHTTPRequestHandler, str], None]) -> ServerHarness:
    seen_paths: list[str] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            self._handle()

        def do_POST(self) -> None:  # noqa: N802
            self._handle()

        def do_DELETE(self) -> None:  # noqa: N802
            self._handle()

        def _handle(self) -> None:
            parsed = urlparse(self.path)
            seen_paths.append(parsed.path)
            router(self, parsed.path)

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    return ServerHarness(server=server, thread=thread, base_url=f"http://{host}:{port}", seen_paths=seen_paths)


class TelagentSdkTests(unittest.TestCase):
    def test_quickstart_create_group_and_send_pull_message(self) -> None:
        def router(handler: BaseHTTPRequestHandler, path: str) -> None:
            if handler.command == "POST" and path == "/api/v1/groups":
                body = read_json(handler)
                write_json(
                    handler,
                    201,
                    {
                        "data": {
                            "group": {
                                "groupId": body["groupId"],
                                "creatorDid": body["creatorDid"],
                            },
                            "txHash": "0xgroup",
                        },
                        "links": {
                            "self": f"/api/v1/groups/{body['groupId']}",
                        },
                    },
                )
                return

            if handler.command == "POST" and path == "/api/v1/messages":
                write_json(
                    handler,
                    201,
                    {
                        "data": {
                            "envelope": {
                                "envelopeId": "env-1",
                                "conversationId": "direct:alice-bob",
                                "conversationType": "direct",
                                "routeHint": {
                                    "targetDomain": "alpha.tel",
                                    "targetDid": "did:claw:zTarget",
                                    "mailboxKeyId": "mailbox-1",
                                },
                                "sealedHeader": "0x11",
                                "seq": "1",
                                "ciphertext": "0x22",
                                "contentType": "text",
                                "sentAtMs": 2000,
                                "ttlSec": 60,
                                "provisional": False,
                            }
                        }
                    },
                )
                return

            if handler.command == "GET" and path == "/api/v1/messages/pull":
                query = parse_qs(urlparse(handler.path).query)
                self.assertEqual(query.get("conversation_id", [None])[0], "direct:alice-bob")
                write_json(
                    handler,
                    200,
                    {
                        "data": {
                            "items": [
                                {
                                    "envelopeId": "env-1",
                                    "conversationId": "direct:alice-bob",
                                    "conversationType": "direct",
                                    "routeHint": {
                                        "targetDomain": "alpha.tel",
                                        "targetDid": "did:claw:zTarget",
                                        "mailboxKeyId": "mailbox-1",
                                    },
                                    "sealedHeader": "0x11",
                                    "seq": "1",
                                    "ciphertext": "0x22",
                                    "contentType": "text",
                                    "sentAtMs": 2000,
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
                handler,
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

        harness = start_server(router)
        self.addCleanup(harness.close)

        sdk = TelagentSdk(base_url=harness.base_url)
        created = sdk.create_group(
            {
                "creatorDid": "did:claw:zAlice",
                "groupId": f"0x{'1' * 64}",
                "groupDomain": "alpha.tel",
                "domainProofHash": f"0x{'2' * 64}",
                "initialMlsStateHash": f"0x{'3' * 64}",
            }
        )
        self.assertEqual(created["group"]["groupId"], f"0x{'1' * 64}")

        sent = sdk.send_message(
            {
                "senderDid": "did:claw:zAlice",
                "conversationId": "direct:alice-bob",
                "conversationType": "direct",
                "targetDomain": "alpha.tel",
                "targetDid": "did:claw:zTarget",
                "mailboxKeyId": "mailbox-1",
                "sealedHeader": "0x11",
                "ciphertext": "0x22",
                "contentType": "text",
                "ttlSec": 60,
            }
        )
        self.assertEqual(sent["seq"], 1)

        pulled = sdk.pull_messages(conversation_id="direct:alice-bob", limit=20)
        self.assertEqual(len(pulled["items"]), 1)
        self.assertEqual(pulled["items"][0]["seq"], 1)
        self.assertTrue(all(path.startswith("/api/v1/") for path in harness.seen_paths))

    def test_maps_rfc7807_to_telagent_sdk_error(self) -> None:
        def router(handler: BaseHTTPRequestHandler, _path: str) -> None:
            write_json(
                handler,
                422,
                {
                    "type": "https://telagent.dev/errors/unprocessable-entity",
                    "title": "Unprocessable Entity",
                    "status": 422,
                    "detail": "DID is revoked or inactive",
                    "code": "UNPROCESSABLE_ENTITY",
                },
                content_type="application/problem+json; charset=utf-8",
            )

        harness = start_server(router)
        self.addCleanup(harness.close)

        sdk = TelagentSdk(base_url=harness.base_url)
        with self.assertRaises(TelagentSdkError) as raised:
            sdk.send_message(
                {
                    "senderDid": "did:claw:zAlice",
                    "conversationId": "direct:alice-bob",
                    "conversationType": "direct",
                    "targetDomain": "alpha.tel",
                    "targetDid": "did:claw:zTarget",
                    "mailboxKeyId": "mailbox-1",
                    "sealedHeader": "0x11",
                    "ciphertext": "0x22",
                    "contentType": "text",
                    "ttlSec": 60,
                }
            )
        self.assertEqual(raised.exception.status, 422)
        self.assertEqual(raised.exception.problem.get("code"), "UNPROCESSABLE_ENTITY")

    def test_get_identity_escapes_did_path_segment(self) -> None:
        observed_path = {"value": ""}

        def router(handler: BaseHTTPRequestHandler, path: str) -> None:
            observed_path["value"] = path
            write_json(
                handler,
                200,
                {
                    "data": {
                        "did": "did:claw:zAlice",
                        "didHash": f"0x{'1' * 64}",
                        "controller": f"0x{'2' * 40}",
                        "publicKey": "0x11",
                        "isActive": True,
                        "resolvedAtMs": 1000,
                    }
                },
            )

        harness = start_server(router)
        self.addCleanup(harness.close)

        sdk = TelagentSdk(base_url=harness.base_url)
        sdk.get_identity("did:claw:zAlice/with-slash")
        self.assertEqual(observed_path["value"], "/api/v1/identities/did%3Aclaw%3AzAlice%2Fwith-slash")

    def test_maps_direct_acl_forbidden_problem_to_sdk_error(self) -> None:
        def router(handler: BaseHTTPRequestHandler, _path: str) -> None:
            write_json(
                handler,
                403,
                {
                    "type": "https://telagent.dev/errors/forbidden",
                    "title": "Forbidden",
                    "status": 403,
                    "detail": "senderDid is not a direct conversation participant for conversation(direct:acl-case)",
                    "code": "FORBIDDEN",
                },
                content_type="application/problem+json; charset=utf-8",
            )

        harness = start_server(router)
        self.addCleanup(harness.close)

        sdk = TelagentSdk(base_url=harness.base_url)
        with self.assertRaises(TelagentSdkError) as raised:
            sdk.send_message(
                {
                    "senderDid": "did:claw:zCarol",
                    "conversationId": "direct:acl-case",
                    "conversationType": "direct",
                    "targetDomain": "alpha.tel",
                    "targetDid": "did:claw:zTarget",
                    "mailboxKeyId": "mailbox-1",
                    "sealedHeader": "0x11",
                    "ciphertext": "0x22",
                    "contentType": "text",
                    "ttlSec": 60,
                }
            )

        self.assertEqual(raised.exception.status, 403)
        self.assertEqual(raised.exception.problem.get("code"), "FORBIDDEN")
        self.assertIn("direct conversation participant", str(raised.exception.problem.get("detail", "")))


if __name__ == "__main__":
    unittest.main()
