from __future__ import annotations

import hashlib
import json
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from langflow.services.trellis_v1.admission_models import Admitted, Found
from langflow.services.trellis_v1.admission_router import create_admission_router
from langflow.services.trellis_v1.admission_service import AdmissionService
from langflow.services.trellis_v1.correlation import CorrelationUnknown, ProtocolConflict

ROOT = Path(__file__).resolve().parents[6]
FIXTURES = ROOT / "apps/server/src/langflowContracts/fixtures"
RECEIPT = '{ "retained": "é", "spaces": true }\n'


def fixture(name):
    return json.loads((FIXTURES / f"{name}.json").read_text())


def submission(payload="{}"):
    value = fixture("submission")
    value.update(state="reserved", correlation=None, admission={"state": "closed", "barrierId": "barrier-1"})
    value["submissionDigest"] = hashlib.sha256(payload.encode()).hexdigest()
    return json.dumps(value)


class Authority:
    def __init__(self):
        self.active = False
        self.revoked = False
        self.seen = []

    @asynccontextmanager
    async def guard(self, value, *, permission):
        self.seen.append((value, permission))
        if self.revoked:
            raise HTTPException(403, "authority_revoked")
        self.active = True
        try:
            yield
        finally:
            self.active = False


class Service:
    def __init__(self, authority):
        self.authority = authority
        self.calls = []
        self.unknown = False

    async def lookup(self, key):
        self.calls.append(key)
        if self.unknown:
            raise CorrelationUnknown(key)
        return Found(receiptBytes=RECEIPT)

    async def submit(self, envelope, payload):
        self.calls.append((envelope, payload))
        return Found(receiptBytes=RECEIPT)

    async def open(self, receipt, authority):
        assert self.authority.active
        self.calls.append((receipt, authority.model_dump()))
        return Admitted(receiptBytes=receipt.decode())


@pytest.fixture
def http(tmp_path):
    auth_file = tmp_path / "auth"
    auth_file.write_bytes(b"private-test-token")
    auth_file.chmod(0o600)
    authority = Authority()
    service = Service(authority)
    app = FastAPI()
    app.include_router(create_admission_router(authentication_file=auth_file, service=service, authority=authority))
    with TestClient(app) as client:
        yield client, service, authority


AUTH = {"Authorization": "Bearer private-test-token"}
KEY = {"version": 1, "hostId": "host-1", "executionId": "execution-1"}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "Bearer private-test-token "}])
def test_authentication_precedes_domain_access(http, headers):
    client, service, _ = http
    result = client.post("/trellis-v1/admission/lookup", json=KEY, headers=headers)
    assert result.status_code == 401
    assert service.calls == []


def test_submit_preserves_utf8_and_receipt_bytes(http):
    client, service, _ = http
    payload = '{ "name": "é" }\n'
    envelope = submission(payload)
    result = client.post("/trellis-v1/admission/submit", headers=AUTH,
                         json={"envelopeBytes": envelope, "payloadBytes": payload})
    assert result.status_code == 200
    assert result.json() == {"state": "found", "receiptBytes": RECEIPT}
    assert service.calls == [(envelope.encode(), payload.encode())]


def test_unknown_is_not_authoritative_absence(http):
    client, service, _ = http
    service.unknown = True
    result = client.post("/trellis-v1/admission/lookup", headers=AUTH, json=KEY)
    assert result.json() == {"state": "unknown", "key": KEY}


@pytest.mark.parametrize("body", [{**KEY, "extra": True}, {**KEY, "executionId": 1}])
def test_strict_lookup_rejects_extra_fields_and_coercion(http, body):
    client, service, _ = http
    assert client.post("/trellis-v1/admission/lookup", headers=AUTH, json=body).status_code == 422
    assert service.calls == []


def test_current_authority_guard_covers_admission(http):
    client, service, authority = http
    value = fixture("authority")
    result = client.post("/trellis-v1/admission/open", headers=AUTH,
                         json={"receiptBytes": RECEIPT, "authority": value})
    assert result.json() == {"state": "admitted", "receiptBytes": RECEIPT}
    assert authority.seen == [(value, "native.reserve")]
    assert service.calls == [(RECEIPT.encode(), value)]
    assert not authority.active


def test_revoked_authority_prevents_admission(http):
    client, service, authority = http
    authority.revoked = True
    result = client.post("/trellis-v1/admission/open", headers=AUTH,
                         json={"receiptBytes": RECEIPT, "authority": fixture("authority")})
    assert result.status_code == 403
    assert service.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal", ["completed", "failed", "canceled", "timed_out"])
async def test_terminal_replay_keeps_original_bytes_without_dispatch(terminal):
    envelope = submission().encode()
    prior = SimpleNamespace(submission_bytes=envelope, correlation_receipt_bytes=RECEIPT.encode(), terminal_state=terminal)

    async def lookup(_key):
        return prior

    async def dispatch(_record):
        pytest.fail("terminal replay must not dispatch")

    service = AdmissionService(jobs=SimpleNamespace(lookup_trellis_correlation=lookup), background=None,
                               host_id="host-1", dispatch_submission=dispatch)
    assert (await service.submit(envelope, b"{}")).receiptBytes == RECEIPT
    with pytest.raises(ProtocolConflict, match="submission_identity_conflict"):
        await service.submit(envelope + b" ", b"{}")
    with pytest.raises(ProtocolConflict, match="submission_payload_digest_conflict"):
        await service.submit(envelope, b"{ }")


@pytest.mark.asyncio
async def test_lost_response_reuses_the_saved_job_for_dispatch():
    envelope = submission().encode()
    prior = SimpleNamespace(submission_bytes=envelope, correlation_receipt_bytes=RECEIPT.encode(), terminal_state=None)
    dispatched = []

    async def lookup(_key):
        return prior

    async def dispatch(record):
        dispatched.append(record)

    service = AdmissionService(jobs=SimpleNamespace(lookup_trellis_correlation=lookup), background=None,
                               host_id="host-1", dispatch_submission=dispatch)
    first = await service.submit(envelope, b"{}")
    second = await service.submit(envelope, b"{}")
    assert first.receiptBytes == second.receiptBytes == RECEIPT
    assert dispatched == [prior, prior]
