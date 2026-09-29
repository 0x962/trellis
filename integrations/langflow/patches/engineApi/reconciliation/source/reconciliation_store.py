from __future__ import annotations

import fcntl
import json
import os
import sqlite3
import stat
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID

from langflow.services.trellis_v1.capture_grants import CaptureIdentity
from langflow.services.trellis_v1.capture_store import CaptureGrantStore
from langflow.services.trellis_v1.reconciliation_models import (
    LiveEngineIdentity,
    ReconciliationConflict,
    ReconciliationLease,
    ReconciliationMissing,
    ReconciliationRecord,
    digest,
    parse_acknowledgement,
    parse_lease,
    record_receipt,
)


class ReconciliationLeaseStore:
    def __init__(self, directory: Path, identity: CaptureIdentity, issuer_digest: str):
        metadata = directory.lstat()
        if (
            directory.is_symlink()
            or not stat.S_ISDIR(metadata.st_mode)
            or stat.S_IMODE(metadata.st_mode) != 0o700
            or metadata.st_uid != os.getuid()
        ):
            raise ValueError("reconciliation_store_directory_unsafe")
        self.directory = directory.resolve(strict=True)
        self.identity = identity
        self.issuer_digest = issuer_digest
        self.path = self.directory / "reconciliation-leases.sqlite"
        self.lock_path = self.directory / "reconciliation-leases.lock"
        with self._connection() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS reconciliation_leases ("
                "id TEXT PRIMARY KEY, lease_bytes TEXT NOT NULL, generation INTEGER NOT NULL, "
                "identity_bytes TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('active', 'released')), "
                "acknowledgement_bytes TEXT)"
            )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS reconciliation_generation ("
                "singleton INTEGER PRIMARY KEY CHECK (singleton = 1), generation INTEGER NOT NULL)"
            )
            connection.execute("INSERT OR IGNORE INTO reconciliation_generation VALUES (1, 0)")

    @contextmanager
    def _connection(self):
        descriptor = os.open(self.lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            CaptureGrantStore._private_file(descriptor)
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            database = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            try:
                CaptureGrantStore._private_file(database)
            finally:
                os.close(database)
            connection = sqlite3.connect(self.path)
            try:
                connection.execute("PRAGMA synchronous=FULL")
                connection.execute("BEGIN IMMEDIATE")
                with connection:
                    yield connection
                parent = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(parent)
                finally:
                    os.close(parent)
            finally:
                connection.close()
        finally:
            os.close(descriptor)

    def _lease(self, lease_bytes: str) -> ReconciliationLease:
        lease = parse_lease(lease_bytes)
        if lease.identity != self.identity:
            raise ReconciliationConflict("reconciliation_runtime_identity_conflict")
        if lease.issuerDigest != self.issuer_digest:
            raise ReconciliationConflict("reconciliation_issuer_identity_conflict")
        return lease

    @staticmethod
    def _record(row) -> ReconciliationRecord:
        lease_bytes, state, identity_bytes, acknowledgement_bytes = row
        identity = LiveEngineIdentity.model_validate(json.loads(identity_bytes))
        return ReconciliationRecord(
            leaseBytes=lease_bytes,
            leaseDigest=digest(lease_bytes),
            state=state,
            identity=identity,
            identityBytes=identity_bytes,
            identityDigest=digest(identity_bytes),
            acknowledgementBytes=acknowledgement_bytes,
            receiptId=record_receipt(lease_bytes, state, identity_bytes, acknowledgement_bytes),
        )

    def acquire(self, lease_bytes: str, identity: LiveEngineIdentity) -> ReconciliationRecord:
        lease = self._lease(lease_bytes)
        identity_bytes = identity.model_dump_json()
        with self._connection() as connection:
            prior = connection.execute(
                "SELECT lease_bytes, state, identity_bytes, acknowledgement_bytes "
                "FROM reconciliation_leases WHERE id=?",
                (str(lease.id),),
            ).fetchone()
            if prior:
                if prior[0] != lease_bytes:
                    raise ReconciliationConflict("reconciliation_lease_bytes_conflict")
                return self._record(prior)
            generation = connection.execute(
                "SELECT generation FROM reconciliation_generation WHERE singleton=1"
            ).fetchone()[0]
            if lease.block.generation <= generation:
                raise ReconciliationConflict("reconciliation_generation_stale")
            if connection.execute("SELECT 1 FROM reconciliation_leases WHERE state='active'").fetchone():
                raise ReconciliationConflict("reconciliation_lease_already_active")
            connection.execute(
                "INSERT INTO reconciliation_leases VALUES (?, ?, ?, ?, 'active', NULL)",
                (str(lease.id), lease_bytes, lease.block.generation, identity_bytes),
            )
            connection.execute(
                "UPDATE reconciliation_generation SET generation=? WHERE singleton=1",
                (lease.block.generation,),
            )
        return self._record((lease_bytes, "active", identity_bytes, None))

    def active(self) -> ReconciliationRecord | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT lease_bytes, state, identity_bytes, acknowledgement_bytes "
                "FROM reconciliation_leases WHERE state='active'"
            ).fetchone()
            return self._record(row) if row else None

    def read(self, lease_id: UUID) -> ReconciliationRecord:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT lease_bytes, state, identity_bytes, acknowledgement_bytes "
                "FROM reconciliation_leases WHERE id=?",
                (str(lease_id),),
            ).fetchone()
            if row is None:
                raise ReconciliationMissing("reconciliation_lease_not_found")
            self._lease(row[0])
            return self._record(row)

    def release(
        self,
        lease_id: UUID,
        lease_bytes: str,
        acknowledgement_bytes: str,
    ) -> ReconciliationRecord:
        lease = self._lease(lease_bytes)
        acknowledgement = parse_acknowledgement(acknowledgement_bytes)
        if (
            lease.id != lease_id
            or acknowledgement.leaseId != lease.id
            or acknowledgement.blockId != lease.block.id
            or acknowledgement.dataHomeId != lease.block.dataHomeId
            or acknowledgement.generation != lease.block.generation
        ):
            raise ReconciliationConflict("reconciliation_acknowledgement_scope_conflict")
        with self._connection() as connection:
            prior = connection.execute(
                "SELECT lease_bytes, state, identity_bytes, acknowledgement_bytes "
                "FROM reconciliation_leases WHERE id=?",
                (str(lease_id),),
            ).fetchone()
            if prior is None:
                raise ReconciliationMissing("reconciliation_lease_not_found")
            if prior[0] != lease_bytes:
                raise ReconciliationConflict("reconciliation_lease_bytes_conflict")
            if prior[3] is not None and prior[3] != acknowledgement_bytes:
                raise ReconciliationConflict("reconciliation_acknowledgement_conflict")
            connection.execute(
                "UPDATE reconciliation_leases SET state='released', acknowledgement_bytes=? WHERE id=?",
                (acknowledgement_bytes, str(lease_id)),
            )
        return self._record((lease_bytes, "released", prior[2], acknowledgement_bytes))
