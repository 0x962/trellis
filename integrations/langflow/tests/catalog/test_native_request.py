from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import httpx
import pytest

from integrations.langflow.components.catalog.nativeRequest import request_native_attempt


@pytest.fixture
def native_endpoint():
	state = {"status": 200, "response": b'{ "version": 1, "stepId": "saved-step" }\n', "requests": []}

	class Handler(BaseHTTPRequestHandler):
		def do_POST(self):
			body = self.rfile.read(int(self.headers["Content-Length"]))
			state["requests"].append({"path": self.path, "headers": self.headers, "body": body})
			self.send_response(state["status"])
			self.send_header("Content-Type", "application/json")
			self.send_header("Location", "/must-not-follow")
			self.end_headers()
			self.wfile.write(state["response"])

		def log_message(self, *_args):
			pass

	server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
	thread = Thread(target=server.serve_forever)
	thread.start()
	try:
		yield f"http://127.0.0.1:{server.server_port}", state
	finally:
		server.shutdown()
		server.server_close()
		thread.join()


async def test_request_keeps_bytes_and_uses_only_explicit_transport(native_endpoint, tmp_path, monkeypatch):
	origin, state = native_endpoint
	secret = tmp_path / "authentication"
	secret.write_text("synthetic-private-token", encoding="utf-8")
	monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
	monkeypatch.setenv("ALL_PROXY", "http://127.0.0.1:1")
	monkeypatch.setenv("NO_PROXY", "")
	request = '{ "version": 1, "nodeId": "nœud", "inputReceiptIds": ["b", "a"] }\n'
	result = await request_native_attempt(
		request, origin=origin, authentication_file=secret, capability_id="capability-current",
	)
	assert result.encode("utf-8") == state["response"]
	assert len(state["requests"]) == 1
	recorded = state["requests"][0]
	assert recorded["path"] == "/api/langflow-private/v1/native-reservations"
	assert recorded["body"] == request.encode("utf-8")
	assert recorded["headers"]["Authorization"] == "Bearer synthetic-private-token"
	assert recorded["headers"]["X-Trellis-Capability-Id"] == "capability-current"


@pytest.mark.parametrize("status", [302, 401, 409, 500])
async def test_client_does_not_redirect_or_repeat_unknown_requests(native_endpoint, tmp_path, status):
	origin, state = native_endpoint
	state["status"] = status
	secret = tmp_path / "authentication"
	secret.write_text("synthetic-private-token", encoding="utf-8")
	with pytest.raises(httpx.HTTPStatusError) as failure:
		await request_native_attempt(
			'{"requestId":"retained-request"}', origin=origin,
			authentication_file=secret, capability_id="capability-current",
		)
	assert failure.value.response.status_code == status
	assert len(state["requests"]) == 1
