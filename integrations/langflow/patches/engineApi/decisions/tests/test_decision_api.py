import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from langflow.services.trellis_v1.decision_api import create_decision_router
from langflow.services.trellis_v1.decisions import DecisionConflictError, DecisionNotPendingError
from langflow.services.trellis_v1.engine_api import AuthorityConflict, AuthorityUnauthorized, TransportUnauthorized

FIXTURES = Path(__file__).resolve().parents[6] / "apps/server/src/langflowContracts/fixtures"


def fixture(name):
    return json.loads((FIXTURES / f"{name}.json").read_text())


def client(service, authentication_error=None):
    async def authenticate(value):
        if authentication_error is not None:
            raise authentication_error
        if value != "Bearer private-engine-token":
            raise TransportUnauthorized("invalid")
        return SimpleNamespace(instance_id="instance-1")

    app = FastAPI()
    app.include_router(
        create_decision_router(
            security=SimpleNamespace(require_transport_auth=authenticate),
            execution_service=service,
        ),
        prefix="/trellis-v1",
    )
    return TestClient(app, headers={"Authorization": "Bearer private-engine-token"})


def accept_body(*, approved=False, notes="Feedback" ):
    decision = fixture("human-decision")
    decision["approved"] = approved
    decision["output"] = notes
    text = json.dumps(decision, ensure_ascii=False, indent=2)
    return {
        "decisionBytes": text,
        "payloadDigest": hashlib.sha256(text.encode()).hexdigest(),
        "authorityBytes": (FIXTURES / "authority.json").read_text(),
    }


def acceptance(body):
    return fixture("decision-acceptance") | {"payloadDigest": body["payloadDigest"]}


def service():
    return SimpleNamespace(
        accept_trellis_human_decision=AsyncMock(),
        lookup_trellis_human_decision=AsyncMock(),
    )


def test_negative_decision_preserves_full_unicode_notes_and_original_bytes():
    backend = service()
    body = accept_body(notes="Human feedback 漢字\n" * 100_000)
    backend.accept_trellis_human_decision.return_value = acceptance(body)
    with client(backend) as http:
        response = http.post("/trellis-v1/decisions/accept", json=body)
    assert response.status_code == 200
    sent = backend.accept_trellis_human_decision.await_args.kwargs
    assert sent["decision_bytes"] == body["decisionBytes"].encode()
    assert sent["authority_bytes"] == body["authorityBytes"].encode()
    assert sent["payload_digest"] == body["payloadDigest"]
    assert json.loads(sent["decision_bytes"])["approved"] is False


def test_lost_acknowledgement_lookup_does_not_submit_another_decision():
    backend = service()
    body = accept_body()
    saved = acceptance(body)
    backend.accept_trellis_human_decision.return_value = saved
    backend.lookup_trellis_human_decision.return_value = {"state": "accepted", "receipt": saved}
    lookup = {key: saved[key] for key in (
        "version", "executionId", "engineJobId", "engineRequestId", "decisionId", "payloadDigest"
    )}
    with client(backend) as http:
        http.post("/trellis-v1/decisions/accept", json=body)
        response = http.post("/trellis-v1/decisions/lookup", json=lookup)
    assert response.status_code == 200
    assert response.json() == {"state": "accepted", "receipt": saved}
    assert backend.accept_trellis_human_decision.await_count == 1
    assert backend.lookup_trellis_human_decision.await_args.kwargs["payload_digest"] == body["payloadDigest"]


@pytest.mark.parametrize("error,detail", [
    (AuthorityUnauthorized("secret grant"), "decision_authority_refused"),
    (AuthorityConflict("secret grant"), "decision_authority_refused"),
    (DecisionConflictError("secret notes"), "decision_conflict"),
    (DecisionNotPendingError("secret notes"), "decision_not_pending"),
])
def test_conflicts_never_return_acceptance_or_private_details(error, detail):
    backend = service()
    backend.accept_trellis_human_decision.side_effect = error
    with client(backend) as http:
        response = http.post("/trellis-v1/decisions/accept", json=accept_body())
    assert response.status_code == 409
    assert response.json() == {"detail": detail}


def test_invalid_decision_cannot_reach_the_service():
    backend = service()
    with client(backend) as http:
        response = http.post("/trellis-v1/decisions/accept", json=accept_body() | {"decisionBytes": "{}"})
    assert response.status_code == 422
    backend.accept_trellis_human_decision.assert_not_awaited()


def test_transport_rejection_precedes_service_dispatch():
    backend = service()
    with client(backend, TransportUnauthorized("private token")) as http:
        response = http.post("/trellis-v1/decisions/accept", json=accept_body())
    assert response.status_code == 401
    assert response.json() == {"detail": "engine_transport_unauthorized"}
    backend.accept_trellis_human_decision.assert_not_awaited()
