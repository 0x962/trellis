from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from langflow.services.trellis_v1.capture_boundary import CaptureBoundary, CapturePaused
from langflow.services.trellis_v1.capture_grants import CaptureIdentity
from langflow.services.trellis_v1.capture_store import CaptureGrantStore
from langflow.services.trellis_v1.reconciliation_models import (
    DatabaseIdentity,
    LiveEngineIdentity,
    PackageIdentity,
    ReconciliationConflict,
    SecretIdentity,
)
from langflow.services.trellis_v1.reconciliation_reader import LiveIdentityReader
from langflow.services.trellis_v1.reconciliation_store import ReconciliationLeaseStore


def private_directory(path: Path) -> Path:
    path.mkdir(mode=0o700)
    return path


def identity() -> CaptureIdentity:
    return CaptureIdentity(
        dataHomeId=uuid4(),
        hostId=uuid4(),
        ownerId=uuid4(),
        instanceId=uuid4(),
        manifestDigest="a" * 64,
    )


class Reader:
    def __init__(self, runtime: CaptureIdentity):
        self.checkpoints = []
        self.value = LiveEngineIdentity(
            runtime=runtime,
            package=PackageIdentity(
                enginePackageDigest="b" * 64,
                componentManifestHash="c" * 64,
                engineCommit="d" * 40,
                engineConfigSha256="e" * 64,
            ),
            database=DatabaseIdentity(
                path="/data/config/langflow.db",
                contentSha256="f" * 64,
                size=32,
                alembicHeads=("9d1a3e6c4f8b",),
            ),
            secret=SecretIdentity(sha256="1" * 64),
        )

    def read(self, *, checkpoint: bool):
        self.checkpoints.append(checkpoint)
        return self.value


def lease_bytes(runtime: CaptureIdentity, issuer_digest: str, *, lease_id=None, generation=7) -> str:
    return json.dumps(
        {
            "version": 1,
            "id": str(lease_id or uuid4()),
            "block": {
                "id": str(uuid4()),
                "dataHomeId": str(runtime.dataHomeId),
                "generation": generation,
                "requestId": "reconcile-request",
            },
            "identity": runtime.model_dump(mode="json"),
            "issuerDigest": issuer_digest,
        },
        separators=(",", ":"),
    )


def acknowledgement_bytes(record) -> str:
    lease = json.loads(record.leaseBytes)
    return json.dumps(
        {
            "version": 1,
            "leaseId": lease["id"],
            "blockId": lease["block"]["id"],
            "dataHomeId": lease["block"]["dataHomeId"],
            "generation": lease["block"]["generation"],
            "reconciliationReceiptId": "host-reconciliation-receipt",
        },
        separators=(",", ":"),
    )


@pytest.mark.asyncio
async def test_active_lease_survives_reopen_and_blocks_writers(tmp_path):
    runtime = identity()
    capture_dir = private_directory(tmp_path / "capture")
    reconciliation_dir = private_directory(tmp_path / "reconciliation")
    issuer_digest = hashlib.sha256(b"issuer").hexdigest()
    capture = CaptureGrantStore(capture_dir, runtime)
    reconciliation = ReconciliationLeaseStore(reconciliation_dir, runtime, issuer_digest)
    boundary = CaptureBoundary(capture, reconciliation)
    reader = Reader(runtime)
    original = lease_bytes(runtime, issuer_digest)

    record = await boundary.acquire_reconciliation(original, reader)

    assert record.state == "active"
    assert record.identity == reader.value
    assert reader.checkpoints == [True]
    with pytest.raises(CapturePaused, match="engine_capture_active"):
        async with boundary.writer():
            pass

    reopened = CaptureBoundary(
        CaptureGrantStore(capture_dir, runtime),
        ReconciliationLeaseStore(reconciliation_dir, runtime, issuer_digest),
    )
    with pytest.raises(CapturePaused, match="engine_capture_active"):
        async with reopened.writer():
            pass

    current = await reopened.read_reconciliation_identity(UUID(json.loads(original)["id"]), reader)
    assert current == reader.value


@pytest.mark.asyncio
async def test_release_retains_acknowledgement_and_admits_writers(tmp_path):
    runtime = identity()
    capture_dir = private_directory(tmp_path / "capture")
    reconciliation_dir = private_directory(tmp_path / "reconciliation")
    issuer_digest = hashlib.sha256(b"issuer").hexdigest()
    boundary = CaptureBoundary(
        CaptureGrantStore(capture_dir, runtime),
        ReconciliationLeaseStore(reconciliation_dir, runtime, issuer_digest),
    )
    reader = Reader(runtime)
    original = lease_bytes(runtime, issuer_digest)
    record = await boundary.acquire_reconciliation(original, reader)
    lease_id = UUID(json.loads(original)["id"])
    acknowledgement = acknowledgement_bytes(record)

    released = await boundary.release_reconciliation(lease_id, original, acknowledgement)

    assert released.state == "released"
    assert released.acknowledgementBytes == acknowledgement
    async with boundary.writer():
        pass
    with pytest.raises(ReconciliationConflict, match="reconciliation_acknowledgement_conflict"):
        await boundary.release_reconciliation(lease_id, original, f"{acknowledgement} ")


def test_live_reader_checkpoints_and_hashes_exact_database_file(tmp_path):
    database_path = tmp_path / "langflow.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("CREATE TABLE alembic_version (version_num TEXT NOT NULL)")
        connection.execute("INSERT INTO alembic_version VALUES ('9d1a3e6c4f8b')")
        connection.execute("CREATE TABLE retained (value TEXT NOT NULL)")
        connection.execute("INSERT INTO retained VALUES ('exact bytes')")
    config = tmp_path / "engine-api.json"
    config.write_bytes(b'{"version":1}')
    secret = SimpleNamespace(get_secret_value=lambda: "secret-value")
    reader = LiveIdentityReader(
        database=SimpleNamespace(
            engine=SimpleNamespace(
                dialect=SimpleNamespace(name="sqlite"),
                url=SimpleNamespace(database=str(database_path)),
            )
        ),
        settings=SimpleNamespace(auth_settings=SimpleNamespace(SECRET_KEY=secret)),
        runtime_identity=identity(),
        engine_package_digest="2" * 64,
        component_manifest_hash="3" * 64,
        engine_commit="4" * 40,
        engine_config_file=config,
    )

    result = reader.read(checkpoint=True)

    assert result.database.path == str(database_path)
    assert result.database.alembicHeads == ("9d1a3e6c4f8b",)
    assert result.database.contentSha256 == hashlib.sha256(database_path.read_bytes()).hexdigest()
    assert result.database.size == database_path.stat().st_size
    assert result.secret.sha256 == hashlib.sha256(b"secret-value").hexdigest()
    assert result.package.engineConfigSha256 == hashlib.sha256(config.read_bytes()).hexdigest()
