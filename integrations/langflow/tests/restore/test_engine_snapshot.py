from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "correlation"))
from correlation_fixture_support import FLOW_ID, JOB_ID, USER_ID, contract_bytes, reserved_submission_bytes
from real_transaction_fixture_support import private_database_service, real_services_job_service
from lfx.graph.checkpoint.schema import GraphCheckpoint
from langflow.services.database.models.jobs.model import JobStatus
from langflow.services.deps import get_db_service, get_settings_service, session_scope
from langflow.services.trellis_v1.backup import SnapshotBinding
from langflow.services.trellis_v1.backup_router import create_backup_router
from langflow.services.trellis_v1.capture_boundary import CaptureBoundary
from langflow.services.trellis_v1.capture_grants import CaptureIdentity
from langflow.services.trellis_v1.capture_router import create_capture_authority_router
from langflow.services.trellis_v1.capture_store import CaptureGrantStore
from langflow.services.trellis_v1.correlation import CorrelationCoordinator, JobServiceCorrelationStore
from langflow.services.trellis_v1.engine_api import EngineApiIdentity, EngineApiSecurity, create_engine_api_router

pytest_plugins = ["tests.unit.background_execution.conftest"]


@pytest.mark.real_services
async def test_actual_checkpoint_export_and_reopen(real_services_job_service, real_services_db_url, tmp_path):
    if not real_services_db_url.startswith("sqlite"):
        pytest.skip("The exporter requires the SQLite producer.")
    database = get_db_service()
    settings = get_settings_service()
    jobs = real_services_job_service
    store = JobServiceCorrelationStore(jobs, flow_id=FLOW_ID, user_id=USER_ID)
    await CorrelationCoordinator(store).accept_submission(
        reserved_submission_bytes(), job_id=JOB_ID, correlation_receipt_bytes=contract_bytes("correlation")
    )
    checkpoint = GraphCheckpoint(run_id=str(JOB_ID), job_id=str(JOB_ID), external_waits={"wait-1": "retained bytes"})
    await jobs.save_checkpoint(JOB_ID, "graph", checkpoint.model_dump_json())
    await jobs.update_job_status(JOB_ID, JobStatus.SUSPENDED)
    async with database.engine.connect() as connection:
        revisions = sorted((await connection.execute(text("SELECT version_num FROM alembic_version"))).scalars())
    secret = settings.auth_settings.SECRET_KEY.get_secret_value().encode()
    identity = CaptureIdentity(dataHomeId=uuid4(), hostId=uuid4(), ownerId=uuid4(), instanceId=uuid4(), manifestDigest="a" * 64)
    binding = SnapshotBinding.model_validate({
        "snapshotId": str(uuid4()), "sourceDataHomeId": str(identity.dataHomeId), "sourceHostId": str(identity.hostId),
        "boundaryReceiptId": "fixture-paused-effects", "compatibility": {
            "trellisRelease": "fixture", "enginePackageDigest": "a" * 64,
            "trellisDatabaseVersion": "fixture", "engineDatabaseVersion": ",".join(revisions),
            "secretVersion": hashlib.sha256(secret).hexdigest(),
        },
    })
    exports = tmp_path / "exports"
    exports.mkdir(mode=0o700)
    authentication = tmp_path / "auth"
    authentication.write_text("isolated-test-token")
    authentication.chmod(0o600)
    issuer = tmp_path / "capture-issuer.key"
    issuer.write_bytes(b"isolated-issuer-token")
    issuer.chmod(0o600)
    control = tmp_path / "capture-control"
    control.mkdir(mode=0o700)
    grant_store = CaptureGrantStore(control, identity)
    boundary = CaptureBoundary(grant_store)
    grant_id = uuid4()
    grant_bytes = json.dumps({
        "version": 1, "id": str(grant_id), "identity": identity.model_dump(mode="json"),
        "snapshotId": str(binding.snapshotId), "boundaryReceiptId": binding.boundaryReceiptId,
        "block": {
            "id": str(uuid4()), "dataHomeId": str(identity.dataHomeId), "generation": 1,
            "requestId": "fixture-capture", "reason": {"kind": "capture", "snapshotId": str(binding.snapshotId)},
        },
    })

    app = FastAPI()
    domain = create_backup_router(
        database=database, settings=settings, export_root=exports, authentication_file=authentication,
        package_digest="a" * 64, data_home_id=str(identity.dataHomeId), host_id=str(identity.hostId), snapshot_boundary=boundary.snapshot,
    )
    security = EngineApiSecurity(
        authentication_file=authentication,
        identity=EngineApiIdentity.model_validate(identity.model_dump(mode="json")),
    )
    authority_router = create_capture_authority_router(boundary=boundary, issuer_file=issuer)
    app.include_router(create_engine_api_router(
        security=security, authority_session=session_scope, domain_routers=[domain, authority_router],
    ))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://engine") as client:
        denied = await client.post("/trellis-v1/snapshots", json=binding.model_dump(mode="json"))
        assert denied.status_code == 401
        assert denied.headers["www-authenticate"] == "Bearer"
        assert not list(exports.iterdir())
        absent_alias = await client.post("/api/v1/trellis/snapshots", json=binding.model_dump(mode="json"))
        assert absent_alias.status_code == 404
        assert grant_store.active() is None
        client.headers["Authorization"] = "Bearer isolated-test-token"
        ungranted = await client.post("/trellis-v1/snapshots", json=binding.model_dump(mode="json"))
        assert ungranted.status_code == 409
        granted = await client.post("/trellis-v1/capture-authorities", json={"grantBytes": grant_bytes},
                                    headers={"X-Trellis-Capture-Issuer": "isolated-issuer-token"})
        assert granted.status_code == 200
        response = await client.post("/trellis-v1/snapshots", json=binding.model_dump(mode="json"))
        assert response.status_code == 200, response.text
        duplicate = await client.post("/trellis-v1/snapshots", json=binding.model_dump(mode="json"))
        assert duplicate.status_code == 409
        missing = await client.get(f"/trellis-v1/snapshots/{uuid4()}/database")
        assert missing.status_code == 404
        receipt = response.json()
        assert receipt["binding"] == binding.model_dump(mode="json")
        assert {"job", "job_checkpoints", "trellis_job_correlations"}.issubset(receipt["tables"])
        assert grant_store.read(grant_id).state == "active"
        blob = await client.get(f"/trellis-v1/snapshots/{binding.snapshotId}/database")
        exported_secret = await client.get(f"/trellis-v1/snapshots/{binding.snapshotId}/secret")
        assert hashlib.sha256(blob.content).hexdigest() == receipt["database"]["sha256"]
        assert exported_secret.content == secret
        revoked = await client.post(f"/trellis-v1/capture-authorities/{grant_id}/revoke", json={"grantBytes": grant_bytes},
                                    headers={"X-Trellis-Capture-Issuer": "isolated-issuer-token"})
        assert revoked.status_code == 200
        assert revoked.json()["state"] == "revoked"
    await jobs.save_checkpoint(JOB_ID, "graph", checkpoint.model_copy(update={"external_waits": {}}).model_dump_json())
    restored_path = tmp_path / "restored.sqlite"
    restored_path.write_bytes(blob.content)
    restored_path.chmod(0o600)
    restored = private_database_service(f"sqlite+aiosqlite:///{restored_path}")
    from lfx.services.manager import get_service_manager
    from lfx.services.schema import ServiceType
    manager = get_service_manager()
    manager.services[ServiceType.DATABASE_SERVICE] = restored
    try:
        assert (await jobs.get_job_by_job_id(JOB_ID)).status == JobStatus.SUSPENDED
        retained = GraphCheckpoint.model_validate_json(await jobs.load_checkpoint(JOB_ID, "graph"))
        assert retained.external_waits == checkpoint.external_waits
        assert await CorrelationCoordinator(store).accept_submission(
            reserved_submission_bytes(), job_id=uuid4(), correlation_receipt_bytes=contract_bytes("correlation")
        ) == contract_bytes("correlation")
    finally:
        manager.services[ServiceType.DATABASE_SERVICE] = database
        await restored.teardown()
    assert GraphCheckpoint.model_validate_json(await jobs.load_checkpoint(JOB_ID, "graph")).external_waits == {}
    print(json.dumps({"proof": "engine-checkpoint-export", "jobRetained": True, "laterSourceWriteRetained": True}))
