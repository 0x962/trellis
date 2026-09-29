from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from langflow.services.trellis_v1.admission_models import Admitted, Found
from langflow.services.trellis_v1.admission_router import create_admission_router
from langflow.services.trellis_v1.admission_service import AdmissionService
from langflow.services.trellis_v1.correlation import CorrelationUnknown, ProtocolConflict
from langflow.services.trellis_v1.engine_api import AuthorityUnauthorized, EngineApiIdentity, EngineApiSecurity

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


class Security(EngineApiSecurity):
    def __init__(self, authentication_file):
        super().__init__(authentication_file=authentication_file, identity=EngineApiIdentity(
            instanceId=UUID(int=1), dataHomeId="home-1", hostId="host-1", manifestDigest="a" * 64, ownerId="owner-1",
        ))
        self.revoked = False
        self.seen = []

    async def require_authority(self, session, authority_bytes, permission, **binding):
        self.seen.append((session, authority_bytes, permission, binding))
        if self.revoked:
            raise AuthorityUnauthorized("authority_revoked")


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

    async def open(self, receipt, authority_bytes, *, require_authority):
        await require_authority("domain-session", authority_bytes, "native.reserve",
                                execution_id="execution-1", publication_id="publication-1", engine_job_id="job-1")
        self.calls.append((receipt, authority_bytes))
        return Admitted(receiptBytes=receipt.decode())


@pytest.fixture
def http(tmp_path):
    auth_file = tmp_path / "auth"
    auth_file.write_bytes(b"private-test-token")
    auth_file.chmod(0o600)
    authority = Security(auth_file)
    service = Service(authority)
    app = FastAPI()
    app.include_router(create_admission_router(service=service, security=authority), prefix="/trellis-v1")
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


@pytest.mark.parametrize("body", [{**KEY, "extra": True}, {**KEY, "executionId": 1}, {**KEY, "version": True}])
def test_strict_lookup_rejects_extra_fields_and_coercion(http, body):
    client, service, _ = http
    assert client.post("/trellis-v1/admission/lookup", headers=AUTH, json=body).status_code == 422
    assert service.calls == []


def test_authority_bytes_and_verifier_reach_admission(http):
    client, service, authority = http
    value = json.dumps(fixture("authority"), indent=2) + "\n"
    result = client.post("/trellis-v1/admission/open", headers=AUTH,
                         json={"receiptBytes": RECEIPT, "authorityBytes": value})
    assert result.json() == {"state": "admitted", "receiptBytes": RECEIPT}
    assert authority.seen == [("domain-session", value.encode(), "native.reserve", {
        "execution_id": "execution-1", "publication_id": "publication-1", "engine_job_id": "job-1",
    })]
    assert service.calls == [(RECEIPT.encode(), value.encode())]


def test_revoked_authority_prevents_admission(http):
    client, service, authority = http
    authority.revoked = True
    result = client.post("/trellis-v1/admission/open", headers=AUTH,
                         json={"receiptBytes": RECEIPT, "authorityBytes": json.dumps(fixture("authority"))})
    assert result.status_code == 409
    assert service.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal", ["completed", "failed", "canceled", "timed_out"])
async def test_terminal_replay_keeps_original_bytes_without_dispatch(terminal):
    envelope = submission().encode()
    prior = SimpleNamespace(submission_bytes=envelope, correlation_receipt_bytes=RECEIPT.encode(), terminal_state=terminal)

    async def lookup(_key):
        return prior

    service = AdmissionService(jobs=SimpleNamespace(lookup_trellis_correlation=lookup), background=None,
                               host_id="host-1")
    assert (await service.submit(envelope, b"{}")).receiptBytes == RECEIPT
    with pytest.raises(ProtocolConflict, match="submission_identity_conflict"):
        await service.submit(envelope + b" ", b"{}")
    with pytest.raises(ProtocolConflict, match="submission_payload_digest_conflict"):
        await service.submit(envelope, b"{ }")


@pytest.mark.asyncio
async def test_lost_response_reuses_the_saved_job_for_dispatch():
    envelope = submission().encode()
    prior = SimpleNamespace(submission_bytes=envelope, correlation_receipt_bytes=RECEIPT.encode(), terminal_state=None,
                            job_id=UUID(int=1), engine_session_id="session-saved")
    dispatched = []
    job = SimpleNamespace(flow_id=UUID(int=2), user_id=UUID(int=3))

    async def lookup(_key):
        return prior

    async def get_job(job_id):
        assert job_id == prior.job_id
        return job

    async def dispatch(**request):
        dispatched.append(request)

    service = AdmissionService(
        jobs=SimpleNamespace(lookup_trellis_correlation=lookup, get_job_by_job_id=get_job),
        background=SimpleNamespace(enqueue_trellis_submission=dispatch), host_id="host-1",
    )
    first = await service.submit(envelope, b"{}")
    second = await service.submit(envelope, b"{}")
    assert first.receiptBytes == second.receiptBytes == RECEIPT
    assert len(dispatched) == 2
    assert dispatched[0] == dispatched[1]
    assert dispatched[0]["engine_job_id"] == prior.job_id
    assert dispatched[0]["flow_id"] == job.flow_id
    assert dispatched[0]["user_id"] == job.user_id
    assert json.loads(dispatched[0]["request_bytes"]) == {
        "flow_id": str(job.flow_id), "mode": "background", "stream_protocol": "langflow",
        "input_value": "", "session_id": "session-saved", "tweaks": {}, "globals": {},
        "data": None, "files": None, "start_component_id": None, "stop_component_id": None,
        "output_ids": None, "expose_graph_state": True, "idempotency_key": None,
        "persist_messages": False, "end_user_id": None, "component_substitution_warning": None,
    }
