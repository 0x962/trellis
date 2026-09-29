from __future__ import annotations

import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from langflow.services.trellis_v1.engine_api import AuthorityConflict
from langflow.services.trellis_v1.native_router import create_native_router
from langflow.services.trellis_v1.occurrence_journal import OccurrenceConflict

from test_native_protocol import fixture


@pytest.fixture
def route(monkeypatch):
    completion, wait, original, authority = fixture()
    events = []
    state = {"job_present": True, "receipts_present": True}
    receipts = [
        {"receiptId": "second", "receiptBytes": '{ "output": "NO\\nfull feedback" }', "receiptDigest": "b" * 64},
        {"receiptId": "first", "receiptBytes": '{"output":"first"}\n', "receiptDigest": "a" * 64},
    ]

    class Session:
        async def exec(self, query):
            assert query._for_update_arg is not None
            assert UUID(wait["request"]["engineJobId"]) in query.compile().params.values()
            events.append("lock")
            return SimpleNamespace(first=lambda: object() if state["job_present"] else None)

    session = Session()

    @asynccontextmanager
    async def open_session():
        events.append("open")
        try:
            yield session
        finally:
            events.append("close")

    class Security:
        async def require_transport_auth(self, bearer):
            events.append("transport")
            if bearer != "Bearer fixture":
                raise HTTPException(status_code=401)

        async def require_authority(self, supplied_session, authority_bytes, permission, **binding):
            assert supplied_session is session
            assert events[-1] == "lock"
            assert permission == "native.read"
            events.append("authority")
            expected = {"execution_id": wait["request"]["executionId"],
                        "publication_id": wait["request"]["publicationId"],
                        "engine_job_id": UUID(wait["request"]["engineJobId"])}
            if binding != expected or authority_bytes != completion.authorityBytes.encode("utf-8"):
                raise AuthorityConflict("binding_conflict")
            return SimpleNamespace(authority=SimpleNamespace(
                capability_id=authority["capabilityId"], model_dump=lambda **_: authority,
            ))

    async def read(supplied_session, job_id, request_bytes):
        assert supplied_session is session
        assert job_id == UUID(wait["request"]["engineJobId"])
        assert events[-1] == "authority"
        events.append("read")
        if request_bytes != original or not state["receipts_present"]:
            raise OccurrenceConflict("input_request_not_retained")
        return receipts

    monkeypatch.setattr("langflow.services.trellis_v1.native_router.read_input_receipts", read)
    app = FastAPI()
    app.include_router(create_native_router(
        jobs=object(), executor=object(), security=Security(), open_session=open_session,
    ), prefix="/trellis-v1")
    with TestClient(app) as client:
        yield SimpleNamespace(
            client=client, events=events, state=state, receipts=receipts,
            body={"requestBytes": original, "authorityBytes": completion.authorityBytes},
            headers={"Authorization": "Bearer fixture", "X-Trellis-Capability-Id": authority["capabilityId"]},
        )


def post(route):
    return route.client.post("/trellis-v1/native/input-receipts", json=route.body, headers=route.headers)


def test_reads_original_bytes_in_order_after_locked_authority(route):
    response = post(route)
    assert response.status_code == 200
    assert response.json() == route.receipts
    assert response.headers["cache-control"] == "no-store"
    assert route.events == ["transport", "open", "lock", "authority", "read", "close"]


def test_rejects_transport_before_database_access(route):
    route.headers["Authorization"] = "Bearer forged"
    assert post(route).status_code == 401
    assert route.events == ["transport"]


def test_rejects_capability_before_receipt_access(route):
    route.headers["X-Trellis-Capability-Id"] = "forged"
    assert post(route).status_code == 401
    assert route.events == ["transport", "open", "lock", "authority", "close"]


@pytest.mark.parametrize("field", ["executionId", "publicationId"])
def test_rejects_foreign_request_binding(route, field):
    request = json.loads(route.body["requestBytes"])
    request[field] = "foreign"
    route.body["requestBytes"] = json.dumps(request)
    assert post(route).status_code == 409
    assert "read" not in route.events


@pytest.mark.parametrize("change", ["unknown_bytes", "missing_receipts", "missing_job"])
def test_preserves_unavailable_as_conflict(route, change):
    if change == "unknown_bytes":
        route.body["requestBytes"] += "\n"
    elif change == "missing_receipts":
        route.state["receipts_present"] = False
    else:
        route.state["job_present"] = False
    assert post(route).status_code == 409
    assert route.events[-1] == "close"


@pytest.mark.parametrize("request_bytes", ["{", "[]", '{}', '{"executionId":"a","executionId":"b"}'])
def test_rejects_malformed_request_before_database_access(route, request_bytes):
    route.body["requestBytes"] = request_bytes
    assert post(route).status_code in {409, 422}
    assert route.events == ["transport"]


def test_rejects_extra_body_fields(route):
    route.body["jobId"] = "untrusted"
    assert post(route).status_code == 422
    assert route.events == []
