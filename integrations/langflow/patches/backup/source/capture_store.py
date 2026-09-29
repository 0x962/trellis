from __future__ import annotations

import fcntl
import os
import sqlite3
import stat
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID

from langflow.services.trellis_v1.capture_grants import (
    CaptureConflict, CaptureIdentity, CaptureMissing, CaptureReceipt, capture_receipt, parse_grant,
)


class CaptureGrantStore:
    def __init__(self, directory: Path, identity: CaptureIdentity):
        metadata = directory.lstat()
        if (not stat.S_ISDIR(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o700
                or metadata.st_uid != os.getuid()):
            raise ValueError("capture_store_directory_unsafe")
        self.directory = directory.resolve(strict=True)
        self.identity = identity
        self.path = self.directory / "capture-authorities.sqlite"
        self.lock_path = self.directory / "capture-authorities.lock"
        with self._connection() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS capture_grants ("
                               "id TEXT PRIMARY KEY, grant_bytes TEXT NOT NULL, generation INTEGER NOT NULL, "
                               "state TEXT NOT NULL CHECK (state IN ('active', 'revoked')))")
            connection.execute("CREATE TABLE IF NOT EXISTS capture_generation ("
                               "singleton INTEGER PRIMARY KEY CHECK (singleton = 1), generation INTEGER NOT NULL)")
            connection.execute("INSERT OR IGNORE INTO capture_generation VALUES (1, 0)")

    @contextmanager
    def _connection(self):
        descriptor = os.open(self.lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            self._private_file(descriptor)
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            database = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            try:
                self._private_file(database)
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

    @staticmethod
    def _private_file(descriptor):
        metadata = os.fstat(descriptor)
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1
                or stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_uid != os.getuid()):
            raise ValueError("capture_store_file_unsafe")

    def _grant(self, grant_bytes: str, *, retired: bool = False):
        grant = parse_grant(grant_bytes)
        if (grant.identity.hostId, grant.identity.dataHomeId) != (self.identity.hostId, self.identity.dataHomeId):
            raise CaptureConflict("capture_home_identity_conflict")
        if not retired and grant.identity != self.identity:
            raise CaptureConflict("capture_runtime_identity_conflict")
        return grant

    def commit(self, grant_bytes: str) -> CaptureReceipt:
        grant = self._grant(grant_bytes)
        with self._connection() as connection:
            prior = connection.execute("SELECT grant_bytes, state FROM capture_grants WHERE id=?", (str(grant.id),)).fetchone()
            if prior:
                if prior[0] != grant_bytes:
                    raise CaptureConflict("capture_grant_bytes_conflict")
                return capture_receipt(*prior)
            generation = connection.execute("SELECT generation FROM capture_generation WHERE singleton=1").fetchone()[0]
            if grant.block.generation <= generation:
                raise CaptureConflict("capture_generation_stale")
            if connection.execute("SELECT 1 FROM capture_grants WHERE state='active'").fetchone():
                raise CaptureConflict("capture_grant_already_active")
            connection.execute("INSERT INTO capture_grants VALUES (?, ?, ?, 'active')",
                               (str(grant.id), grant_bytes, grant.block.generation))
            connection.execute("UPDATE capture_generation SET generation=? WHERE singleton=1", (grant.block.generation,))
        return capture_receipt(grant_bytes, "active")

    def active(self) -> CaptureReceipt | None:
        with self._connection() as connection:
            row = connection.execute("SELECT grant_bytes, state FROM capture_grants WHERE state='active'").fetchone()
            return capture_receipt(*row) if row else None

    def read(self, grant_id: UUID) -> CaptureReceipt:
        with self._connection() as connection:
            prior = connection.execute("SELECT grant_bytes, state FROM capture_grants WHERE id=?", (str(grant_id),)).fetchone()
            if prior is None:
                raise CaptureMissing("capture_grant_not_found")
            self._grant(prior[0], retired=prior[1] == "revoked")
            return capture_receipt(*prior)

    def revoke(self, grant_id: UUID, grant_bytes: str) -> CaptureReceipt:
        grant = self._grant(grant_bytes, retired=True)
        if grant.id != grant_id:
            raise CaptureConflict("capture_grant_id_conflict")
        with self._connection() as connection:
            prior = connection.execute("SELECT grant_bytes, state FROM capture_grants WHERE id=?", (str(grant_id),)).fetchone()
            if prior:
                if prior[0] != grant_bytes:
                    raise CaptureConflict("capture_grant_bytes_conflict")
                connection.execute("UPDATE capture_grants SET state='revoked' WHERE id=?", (str(grant_id),))
            else:
                connection.execute("INSERT INTO capture_grants VALUES (?, ?, ?, 'revoked')",
                                   (str(grant_id), grant_bytes, grant.block.generation))
            connection.execute("UPDATE capture_generation SET generation=MAX(generation, ?) WHERE singleton=1",
                               (grant.block.generation,))
        return capture_receipt(grant_bytes, "revoked")
