from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from langflow.services.trellis_v1.authority_recovery_router import create_authority_recovery_router
from langflow.services.trellis_v1.engine_api import EngineApiIdentity, EngineApiSecurity, create_engine_api_router


def test_recovery_requires_transport_and_recovery_issuer_authentication(tmp_path):
    authentication_file = tmp_path / "authentication"
    authentication_file.write_text("engine-token")
    authentication_file.chmod(0o600)
    issuer_file = tmp_path / "authority-recovery-issuer"
    issuer_file.write_text("recovery-token")
    issuer_file.chmod(0o600)
    security = EngineApiSecurity(
        authentication_file=authentication_file,
        identity=EngineApiIdentity(
            instanceId="00000000-0000-4000-8000-000000000001",
            dataHomeId="home-1",
            hostId="host-1",
            manifestDigest="a" * 64,
            ownerId="owner-1",
        ),
    )

    @asynccontextmanager
    async def no_session():
        raise AssertionError("authentication_must_precede_database_access")
        yield

    domain = create_authority_recovery_router(
        security=security,
        open_session=no_session,
        issuer_file=issuer_file,
    )
    app = FastAPI()
    app.include_router(
        create_engine_api_router(
            security=security,
            authority_session=no_session,
            domain_routers=[domain],
        )
    )
    with TestClient(app) as client:
        response = client.post(
            "/trellis-v1/authority/recover-initial",
            headers={"X-Trellis-Authority-Recovery-Issuer": "recovery-token"},
            content=b"{}",
        )
        assert response.status_code == 401
        response = client.post(
            "/trellis-v1/authority/recover-initial",
            headers={"Authorization": "Bearer engine-token"},
            content=b"{}",
        )
        assert response.status_code == 401
        response = client.post(
            "/trellis-v1/authority/recover-initial",
            headers={
                "Authorization": "Bearer engine-token",
                "X-Trellis-Authority-Recovery-Issuer": "recovery-token ",
            },
            content=b"{}",
        )
        assert response.status_code == 401
        response = client.post(
            "/trellis-v1/authority/recover-initial",
            headers={
                "Authorization": "Bearer engine-token",
                "X-Trellis-Authority-Recovery-Issuer": "recovery-token",
            },
            content=b"{}",
        )
        assert response.status_code == 422
