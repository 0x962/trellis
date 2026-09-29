from __future__ import annotations

from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI

from langflow.services.deps import session_scope
from langflow.services.trellis_v1.capture_boundary import CaptureBoundary
from langflow.services.trellis_v1.capture_grants import parse_grant
from langflow.services.trellis_v1.capture_router import create_capture_authority_router
from langflow.services.trellis_v1.engine_api import EngineApiIdentity, EngineApiSecurity, create_engine_api_router
from test_capture_store import capture_store, grant_bytes


@pytest.mark.asyncio
async def test_control_requires_both_credentials_and_retains_unknown_revoke(capture_store, tmp_path):
    transport = tmp_path / "transport.key"
    transport.write_bytes(b"transport-key")
    transport.chmod(0o600)
    issuer = tmp_path / "issuer.key"
    issuer.write_bytes(b"issuer-key")
    issuer.chmod(0o600)
    security = EngineApiSecurity(authentication_file=transport,
                                 identity=EngineApiIdentity.model_validate(capture_store.identity.model_dump(mode="json")))
    boundary = CaptureBoundary(capture_store)
    domain = create_capture_authority_router(boundary=boundary, issuer_file=issuer)
    app = FastAPI()
    app.include_router(create_engine_api_router(security=security, authority_session=session_scope, domain_routers=[domain]))
    original = grant_bytes(capture_store)
    grant = parse_grant(original)
    root = "/trellis-v1/capture-authorities"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://engine") as client:
        assert (await client.post(root, json={"grantBytes": original})).status_code == 401
        client.headers["Authorization"] = "Bearer transport-key"
        assert (await client.post(root, json={"grantBytes": original})).status_code == 401
        assert capture_store.active() is None
        client.headers["X-Trellis-Capture-Issuer"] = "issuer-key"
        assert (await client.get(f"{root}/{uuid4()}")).status_code == 404
        revoked = await client.post(f"{root}/{grant.id}/revoke", json={"grantBytes": original})
        assert revoked.status_code == 200
        assert revoked.json()["state"] == "revoked"
        delayed = await client.post(root, json={"grantBytes": original})
        assert delayed.status_code == 200
        assert delayed.json() == revoked.json()
        assert (await client.get(f"{root}/{grant.id}")).json() == revoked.json()
        changed = await client.post(root, json={"grantBytes": original + " "})
        assert changed.status_code == 409
        assert (await client.post(root, json={"grantBytes": "null"})).status_code == 422
        assert (await client.post("/api/v1/trellis/capture-authorities", json={"grantBytes": original})).status_code == 404
