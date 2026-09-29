from __future__ import annotations

import asyncio
import hashlib
import os
import sqlite3
from contextlib import AbstractAsyncContextManager
from pathlib import Path
from typing import Callable, Literal
from uuid import UUID

import aiosqlite
from pydantic import BaseModel, ConfigDict, Field

from langflow.services.trellis_v1.capture_tasks import finish_capture_task


class SnapshotConflict(ValueError):
    pass


class SnapshotMissing(FileNotFoundError):
    pass


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


async def _export_engine_snapshot(database, settings, root: Path, binding: SnapshotBinding, *, package_digest: str,
                                 data_home_id: str, host_id: str) -> EngineSnapshotReceipt:
    if database.engine.dialect.name != "sqlite":
        raise ValueError("engine_snapshot_database_unsupported")
    if (binding.compatibility.enginePackageDigest, binding.sourceDataHomeId, binding.sourceHostId) != (
        package_digest, data_home_id, host_id
    ):
        raise SnapshotConflict("engine_snapshot_identity_conflict")
    secret = settings.auth_settings.SECRET_KEY.get_secret_value().encode("utf-8")
    if hashlib.sha256(secret).hexdigest() != binding.compatibility.secretVersion:
        raise SnapshotConflict("engine_snapshot_secret_conflict")
    directory = root / str(binding.snapshotId)
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError as error:
        raise SnapshotConflict("engine_snapshot_exists") from error
    target = directory / "database.sqlite"
    write_private(target, b"")
    async with database.engine.connect() as connection:
        raw = await connection.get_raw_connection()
        async with aiosqlite.connect(target) as destination:
            await raw.driver_connection.backup(destination)
    revisions, tables = await asyncio.to_thread(inspect_database, target)
    if ",".join(revisions) != binding.compatibility.engineDatabaseVersion:
        raise SnapshotConflict("engine_snapshot_database_version_conflict")
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


async def capture_engine_snapshot(database, settings, root: Path, binding: SnapshotBinding, *, package_digest: str,
                                  data_home_id: str, host_id: str,
                                  snapshot_boundary: Callable[[SnapshotBinding], AbstractAsyncContextManager]) -> EngineSnapshotReceipt:
    async with snapshot_boundary(binding):
        return await finish_capture_task(_export_engine_snapshot(
            database, settings, root, binding, package_digest=package_digest,
            data_home_id=data_home_id, host_id=host_id,
        ))


def snapshot_file(root: Path, snapshot_id: UUID, part: str) -> Path:
    names = {"database": "database.sqlite", "secret": "secret"}
    if part not in names:
        raise SnapshotMissing("engine_snapshot_part_not_found")
    directory = root / str(snapshot_id)
    try:
        receipt_bytes = (directory / "receipt.json").read_bytes()
    except FileNotFoundError as error:
        raise SnapshotMissing("engine_snapshot_not_found") from error
    receipt = EngineSnapshotReceipt.model_validate_json(receipt_bytes)
    if receipt.binding.snapshotId != snapshot_id:
        raise SnapshotConflict("engine_snapshot_receipt_conflict")
    return directory / names[part]
