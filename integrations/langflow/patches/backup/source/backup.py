from __future__ import annotations

import asyncio
import hashlib
import os
import sqlite3
from pathlib import Path
from typing import Literal
from uuid import UUID

import aiosqlite
from pydantic import BaseModel, ConfigDict, Field


class Compatibility(BaseModel):
    model_config = ConfigDict(extra="forbid")
    trellisRelease: str
    enginePackageDigest: str = Field(pattern=r"^[0-9a-f]{64}$")
    trellisDatabaseVersion: str
    engineDatabaseVersion: str
    secretVersion: str


class SnapshotBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    snapshotId: UUID
    sourceDataHomeId: str
    sourceHostId: str
    boundaryReceiptId: str
    compatibility: Compatibility


class ExportedFile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sha256: str
    size: int


class EngineSnapshotReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1] = 1
    binding: SnapshotBinding
    database: ExportedFile
    secret: ExportedFile
    revisions: list[str]
    tables: list[str]


def write_private(path: Path, content: bytes) -> None:
    with path.open("xb") as file:
        os.fchmod(file.fileno(), 0o600)
        file.write(content)
        file.flush()
        os.fsync(file.fileno())


def sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def describe_file(path: Path) -> ExportedFile:
    with path.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    return ExportedFile(sha256=digest, size=path.stat().st_size)


def inspect_database(path: Path) -> tuple[list[str], list[str]]:
    with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as connection:
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("engine_snapshot_integrity_failed")
        revisions = sorted(row[0] for row in connection.execute("SELECT version_num FROM alembic_version"))
        tables = sorted(row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'"))
    return revisions, tables


async def export_engine_snapshot(database, settings, root: Path, binding: SnapshotBinding, *, package_digest: str,
                                 data_home_id: str, host_id: str) -> EngineSnapshotReceipt:
    if database.engine.dialect.name != "sqlite":
        raise ValueError("engine_snapshot_database_unsupported")
    if (binding.compatibility.enginePackageDigest, binding.sourceDataHomeId, binding.sourceHostId) != (
        package_digest, data_home_id, host_id
    ):
        raise ValueError("engine_snapshot_identity_conflict")
    secret = settings.auth_settings.SECRET_KEY.get_secret_value().encode("utf-8")
    if hashlib.sha256(secret).hexdigest() != binding.compatibility.secretVersion:
        raise ValueError("engine_snapshot_secret_conflict")
    directory = root / str(binding.snapshotId)
    directory.mkdir(mode=0o700)
    target = directory / "database.sqlite"
    write_private(target, b"")
    async with database.engine.connect() as connection:
        raw = await connection.get_raw_connection()
        async with aiosqlite.connect(target) as destination:
            await raw.driver_connection.backup(destination)
    revisions, tables = await asyncio.to_thread(inspect_database, target)
    if ",".join(revisions) != binding.compatibility.engineDatabaseVersion:
        raise ValueError("engine_snapshot_database_version_conflict")
    if not {"job", "job_checkpoints", "execution_signals", "trellis_job_correlations",
            "trellis_decision_acceptances_v1", "trellis_decision_enqueue_obligations_v1"}.issubset(tables):
        raise ValueError("engine_snapshot_job_tables_missing")
    with target.open("rb") as file:
        os.fsync(file.fileno())
    write_private(directory / "secret", secret)
    receipt = EngineSnapshotReceipt(
        binding=binding,
        database=await asyncio.to_thread(describe_file, target),
        secret=await asyncio.to_thread(describe_file, directory / "secret"),
        revisions=revisions,
        tables=tables,
    )
    write_private(directory / "receipt.json", receipt.model_dump_json().encode("utf-8"))
    sync_directory(directory)
    sync_directory(root)
    return receipt
