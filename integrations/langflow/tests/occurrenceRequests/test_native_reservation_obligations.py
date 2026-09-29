import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import httpx
import pytest

from langflow.services.trellis_v1 import occurrence_reservations as reservations
from langflow.services.database.models.jobs.model import JobStatus
from langflow.services.trellis_v1.occurrence_journal import OccurrenceConflict
from langflow.services.trellis_v1.occurrence_models import canonical


JOB = UUID("6ce9e3ed-cbf5-43cd-af82-c07c6e5ab3f0")
REQUEST = '{ "requestId": "id", "engineJobId": "6ce9e3ed-cbf5-43cd-af82-c07c6e5ab3f0" }'
VISIT = {"waitId": "wait", "requestBytes": REQUEST, "handleBytes": None}


def setup_recovery(monkeypatch, status=JobStatus.SUSPENDED):
    obligation = {"engineJobId": str(JOB), "engineRequestId": "id", "waitId": "wait",
                  "requestBytes": REQUEST, "visitKey": "visit", "handleConfirmed": False, "queueState": "pending"}
    session = SimpleNamespace(exec=AsyncMock(return_value=SimpleNamespace(one=lambda: SimpleNamespace(status=status))),
                              commit=AsyncMock())
    @asynccontextmanager
    async def sessions():
        yield session
    monkeypatch.setattr(reservations, "session_scope", sessions)
    monkeypatch.setattr(reservations, "checkpoint", AsyncMock(return_value=SimpleNamespace(blob=canonical(obligation))))
    monkeypatch.setattr(reservations, "locked_graph", AsyncMock(return_value=(JOB, {}, None, {"visits": {"visit": VISIT}})))
    monkeypatch.setattr(reservations, "authorize_native", AsyncMock(return_value="capability"))
    transport = SimpleNamespace(reserve=AsyncMock())
    monkeypatch.setattr(reservations, "request_transport", lambda: transport)
    graph = SimpleNamespace(job_id=JOB, _external_wait_lock=asyncio.Lock())
    return graph, transport, session, obligation


@pytest.mark.asyncio
async def test_unknown_response_replays_exact_request_bytes(monkeypatch):
    graph, transport, session, obligation = setup_recovery(monkeypatch)
    transport.reserve.side_effect = httpx.ReadError("unknown response")
    assert await reservations.recover_native_reservation(graph, "wait") is False
    assert await reservations.recover_native_reservation(graph, "wait") is False
    assert transport.reserve.await_args_list[0].args == (REQUEST, "capability")
    assert transport.reserve.await_args_list[1].args == (REQUEST, "capability")
    wait = json.loads(reservations.reservation_wait(VISIT))
    assert wait == {"kind": "native_reservation", "waitId": "wait", "request": json.loads(REQUEST)}
    assert "handle" not in wait


@pytest.mark.asyncio
async def test_cancelled_job_does_not_call_reservation_transport(monkeypatch):
    graph, transport, session, obligation = setup_recovery(monkeypatch, JobStatus.CANCELLED)
    assert await reservations.recover_native_reservation(graph, "wait") == "cancelled"
    transport.reserve.assert_not_awaited()


@pytest.mark.asyncio
async def test_queue_result_cannot_acknowledge_unconfirmed_handle(monkeypatch):
    graph, transport, session, obligation = setup_recovery(monkeypatch)
    with pytest.raises(OccurrenceConflict, match="reservation_dispatch_not_proven"):
        await reservations.finish_native_reservation_obligation(session, JOB, "wait", "dispatched")
