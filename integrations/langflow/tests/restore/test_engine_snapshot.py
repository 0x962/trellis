from __future__ import annotations

import hashlib
import json
import sys
from contextlib import asynccontextmanager
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
from langflow.services.deps import get_db_service, get_settings_service
from langflow.services.trellis_v1.backup import SnapshotBinding
from langflow.services.trellis_v1.backup_router import create_backup_router
from langflow.services.trellis_v1.correlation import CorrelationCoordinator, JobServiceCorrelationStore

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
    binding = SnapshotBinding.model_validate({
        "snapshotId": str(uuid4()), "sourceDataHomeId": "isolated-home", "sourceHostId": "isolated-host",
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
    boundaries = []

    @asynccontextmanager
    async def boundary(request):
        assert request == binding
        boundaries.append("held")
        yield
        boundaries.append("released")

    app = FastAPI()
    app.include_router(create_backup_router(
        database=database, settings=settings, export_root=exports, authentication_file=authentication,
        package_digest="a" * 64, data_home_id="isolated-home", host_id="isolated-host", snapshot_boundary=boundary,
    ), prefix="/api/v1/trellis")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://engine") as client:
        denied = await client.post("/api/v1/trellis/snapshots", json=binding.model_dump(mode="json"))
        assert denied.status_code == 401
        assert denied.headers["www-authenticate"] == "Bearer"
        assert not list(exports.iterdir())
        client.headers["Authorization"] = "Bearer isolated-test-token"
        response = await client.post("/api/v1/trellis/snapshots", json=binding.model_dump(mode="json"))
        assert response.status_code == 200, response.text
        duplicate = await client.post("/api/v1/trellis/snapshots", json=binding.model_dump(mode="json"))
        assert duplicate.status_code == 409
        missing = await client.get(f"/api/v1/trellis/snapshots/{uuid4()}/database")
        assert missing.status_code == 404
        receipt = response.json()
        assert receipt["binding"] == binding.model_dump(mode="json")
        assert {"job", "job_checkpoints", "trellis_job_correlations"}.issubset(receipt["tables"])
        assert boundaries == ["held", "released", "held"]
        blob = await client.get(f"/api/v1/trellis/snapshots/{binding.snapshotId}/database")
        exported_secret = await client.get(f"/api/v1/trellis/snapshots/{binding.snapshotId}/secret")
        assert hashlib.sha256(blob.content).hexdigest() == receipt["database"]["sha256"]
        assert exported_secret.content == secret
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
