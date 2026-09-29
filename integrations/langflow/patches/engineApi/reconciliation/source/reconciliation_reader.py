from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

from langflow.services.trellis_v1.capture_grants import CaptureIdentity
from langflow.services.trellis_v1.reconciliation_models import (
    DatabaseIdentity,
    LiveEngineIdentity,
    PackageIdentity,
    ReconciliationConflict,
    SecretIdentity,
)


class LiveIdentityReader:
    def __init__(
        self,
        *,
        database,
        settings,
        runtime_identity: CaptureIdentity,
        engine_package_digest: str,
        component_manifest_hash: str,
        engine_commit: str,
        engine_config_file: Path,
    ):
        self.database = database
        self.settings = settings
        self.runtime_identity = runtime_identity
        self.engine_package_digest = engine_package_digest
        self.component_manifest_hash = component_manifest_hash
        self.engine_commit = engine_commit
        self.engine_config_file = engine_config_file

    def _database_path(self) -> Path:
        if self.database.engine.dialect.name != "sqlite":
            raise ReconciliationConflict("reconciliation_database_unsupported")
        configured = self.database.engine.url.database
        if not configured:
            raise ReconciliationConflict("reconciliation_database_path_missing")
        path = Path(configured)
        if not path.is_absolute() or path.is_symlink():
            raise ReconciliationConflict("reconciliation_database_path_invalid")
        return path.resolve(strict=True)

    @staticmethod
    def _checkpoint(path: Path) -> None:
        with sqlite3.connect(path) as connection:
            busy, pages, checkpointed = connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if busy != 0 or pages != checkpointed:
            raise ReconciliationConflict("reconciliation_database_checkpoint_incomplete")
        wal = Path(f"{path}-wal")
        if wal.exists() and wal.stat().st_size != 0:
            raise ReconciliationConflict("reconciliation_database_wal_retained")

    @staticmethod
    def _database(path: Path) -> DatabaseIdentity:
        with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as connection:
            if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ReconciliationConflict("reconciliation_database_integrity_failed")
            heads = tuple(sorted(row[0] for row in connection.execute("SELECT version_num FROM alembic_version")))
        with path.open("rb") as source:
            content_sha256 = hashlib.file_digest(source, "sha256").hexdigest()
        return DatabaseIdentity(
            path=str(path),
            contentSha256=content_sha256,
            size=path.stat().st_size,
            alembicHeads=heads,
        )

    def read(self, *, checkpoint: bool) -> LiveEngineIdentity:
        path = self._database_path()
        if checkpoint:
            self._checkpoint(path)
        else:
            wal = Path(f"{path}-wal")
            if wal.exists() and wal.stat().st_size != 0:
                raise ReconciliationConflict("reconciliation_database_changed")
        config_bytes = self.engine_config_file.read_bytes()
        secret = self.settings.auth_settings.SECRET_KEY.get_secret_value().encode("utf-8")
        return LiveEngineIdentity(
            runtime=self.runtime_identity,
            package=PackageIdentity(
                enginePackageDigest=self.engine_package_digest,
                componentManifestHash=self.component_manifest_hash,
                engineCommit=self.engine_commit,
                engineConfigSha256=hashlib.sha256(config_bytes).hexdigest(),
            ),
            database=self._database(path),
            secret=SecretIdentity(sha256=hashlib.sha256(secret).hexdigest()),
        )
