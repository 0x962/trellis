from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from langflow.services.trellis_v1.review_gate_router import create_review_gate_router


def test_http_strings_reach_ledger_as_exact_utf8_bytes(monkeypatch):
    session = object()
    events = []
    binding = {"executionId": "execution", "publicationId": "publication", "engineJobId": str(uuid4())}
    authority = {"capabilityId": "capability"}
    payload = {"engineWaitId": "wait", "resultBytes": '{"text":"é"}',
               "deliveryBytes": '{"delivery":true}', "authorityBytes": '{"capabilityId":"capability"}'}

    class Security:
        async def require_transport_auth(self, bearer):
            assert bearer == "Bearer fixture"
            events.append("transport")

        async def require_authority(self, supplied_session, supplied_bytes, permission, **identities):
            assert supplied_session is session
            assert supplied_bytes == payload["authorityBytes"].encode("utf-8")
            assert permission == "classification.deliver"
            assert str(identities["engine_job_id"]) == binding["engineJobId"]
            return SimpleNamespace(authority=SimpleNamespace(
                capability_id="capability", model_dump=lambda **_: authority,
            ))

    class Ledger:
        def __init__(self, *_args, **_kwargs):
            pass

        async def accept(self, supplied, authorize):
            assert supplied.engineWaitId == payload["engineWaitId"]
            for key in ("resultBytes", "deliveryBytes", "authorityBytes"):
                assert getattr(supplied, key) == payload[key].encode("utf-8")
            assert await authorize(session, binding) == authority
            events.append("committed")
            return {"receiptBytes": '{"receipt":"exact"}'}

    class Executor:
        async def consume_review_classification_obligation(self, obligation):
            assert events[-1] == "committed"
            events.append("dispatch")

    monkeypatch.setattr("langflow.services.trellis_v1.review_gate_router.ReviewClassificationLedger", Ledger)
    app = FastAPI()
    app.include_router(create_review_gate_router(jobs=object(), executor=Executor(), security=Security()), prefix="/trellis-v1")
    with TestClient(app) as client:
        headers = {"Authorization": "Bearer fixture", "X-Trellis-Capability-Id": "capability"}
        response = client.post("/trellis-v1/review-classifications/accept", json=payload, headers=headers)
        assert response.status_code == 200
        assert response.content == b'{"receipt":"exact"}'
        assert events == ["transport", "committed", "dispatch"]
        events.clear()
        headers["X-Trellis-Capability-Id"] = "forged"
        response = client.post("/trellis-v1/review-classifications/accept", json=payload, headers=headers)
        assert response.status_code == 401
        assert events == ["transport"]
