from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from langflow.services.trellis_v1.cancellation import read_cancellation
from langflow.services.trellis_v1.cancellation_router import create_cancellation_router

pytestmark = pytest.mark.asyncio


async def test_transport_authentication_precedes_cancellation_write(fixture):
    app = FastAPI()
    background = SimpleNamespace(stop_job=AsyncMock())
    app.include_router(create_cancellation_router(
        security=fixture.security, sessions=fixture.sessions, background=background,
    ), prefix="/trellis-v1")
    async with AsyncClient(transport=ASGITransport(app), base_url="http://fixture") as client:
        denied = await client.post("/trellis-v1/cancellation", json=fixture.input.model_dump(by_alias=True, mode="json"))
        assert denied.status_code == 401
        async with fixture.sessions() as session:
            assert await read_cancellation(session, fixture.job_id) is None
        accepted = await client.post(
            "/trellis-v1/cancellation", json=fixture.input.model_dump(by_alias=True, mode="json"),
            headers={"Authorization": "Bearer fixture-bearer"},
        )
        assert accepted.status_code == 200
        body = accepted.json()
        assert body["receipt"]["requestId"] == str(fixture.input.request_id)
        assert body["receipt"]["executionId"] == fixture.input.execution_id
        assert body["receipt"]["engineJobId"] == str(fixture.job_id)
        assert body["engineStatus"] == "in_progress"
        assert "exited" not in body


async def test_changed_receipt_request_returns_conflict(fixture):
    app = FastAPI()
    app.include_router(create_cancellation_router(
        security=fixture.security, sessions=fixture.sessions, background=SimpleNamespace(stop_job=AsyncMock()),
    ), prefix="/trellis-v1")
    payload = fixture.input.model_dump(by_alias=True, mode="json")
    async with AsyncClient(transport=ASGITransport(app), base_url="http://fixture") as client:
        first = await client.post("/trellis-v1/cancellation", json=payload,
                                  headers={"Authorization": "Bearer fixture-bearer"})
        assert first.status_code == 200
        payload["cancelIntentBytes"] += " "
        conflict = await client.post("/trellis-v1/cancellation", json=payload,
                                     headers={"Authorization": "Bearer fixture-bearer"})
        assert conflict.status_code == 409
        assert conflict.json()["detail"] == "cancellation_identity_conflict"
