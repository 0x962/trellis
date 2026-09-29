from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from langflow.services.trellis_v1.native_router import create_native_router

from test_native_protocol import fixture


def test_route_requires_authority_in_ledger_session_and_preserves_receipt(monkeypatch):
    payload, wait, _, authority = fixture()
    session = object()
    events = []

    class Security:
        async def require_transport_auth(self, bearer):
            assert bearer == "Bearer fixture"
            events.append("transport")

        async def require_authority(self, supplied_session, authority_bytes, permission, **binding):
            assert supplied_session is session
            assert authority_bytes == payload.authorityBytes.encode()
            assert permission == "completion.deliver"
            assert binding["engine_job_id"] == UUID(wait["request"]["engineJobId"])
            events.append("authority")
            return SimpleNamespace(authority=SimpleNamespace(
                capability_id=authority["capabilityId"], model_dump=lambda **_: authority,
            ))

    class Ledger:
        def __init__(self, *_args, **_kwargs):
            pass

        async def accept(self, supplied, authorize):
            assert supplied == payload
            events.append("locked")
            assert await authorize(session, wait["request"]) == authority
            events.append("committed")
            return {"receiptBytes": '{"original":"bytes"}'}

    class Executor:
        async def consume_external_completion_obligation(self, obligation):
            assert events[-1] == "committed"
            events.append("dispatch")

    monkeypatch.setattr("langflow.services.trellis_v1.native_router.NativeCompletionLedger", Ledger)
    app = FastAPI()
    app.include_router(create_native_router(jobs=object(), executor=Executor(), security=Security()), prefix="/trellis-v1")
    with TestClient(app) as client:
        headers = {"Authorization": "Bearer fixture", "X-Trellis-Capability-Id": authority["capabilityId"]}
        response = client.post("/trellis-v1/native/completions", json=payload.model_dump(), headers=headers)
        assert response.status_code == 200
        assert response.content == b'{"original":"bytes"}'
        assert events == ["transport", "locked", "authority", "committed", "dispatch"]
        events.clear()
        headers["X-Trellis-Capability-Id"] = "forged"
        response = client.post("/trellis-v1/native/completions", json=payload.model_dump(), headers=headers)
        assert response.status_code == 401
        assert events == ["transport", "locked", "authority"]
