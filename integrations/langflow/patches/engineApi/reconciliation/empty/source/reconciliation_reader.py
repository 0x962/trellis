from __future__ import annotations

import hashlib
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from langflow.services.trellis_v1.authority import parse_authority
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

    @staticmethod
    def _authority(path: Path, execution_id: str) -> dict[str, object] | None:
        with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT authority_bytes, authority_digest, publication_id, engine_job_id, "
                "engine_epoch, host_id, owner_id, ownership_revision, capability_id, "
                "expires_at, revoked_at FROM trellis_delivery_authorities WHERE execution_id=?",
                (execution_id,),
            ).fetchone()
        if row is None:
            return None
        authority_bytes = bytes(row["authority_bytes"])
        binding = parse_authority(authority_bytes)
        authority = binding.authority
        expires_at = datetime.fromisoformat(row["expires_at"])
        stored_expires_at = (
            expires_at if expires_at.tzinfo is not None else expires_at.replace(tzinfo=timezone.utc)
        )
        if (
            binding.authority_digest != row["authority_digest"]
            or authority.execution_id != execution_id
            or authority.publication_id != row["publication_id"]
            or authority.engine_job_id != UUID(row["engine_job_id"])
            or authority.engine_epoch != row["engine_epoch"]
            or authority.host_id != row["host_id"]
            or authority.owner_id != row["owner_id"]
            or authority.ownership_revision != row["ownership_revision"]
            or authority.capability_id != row["capability_id"]
            or authority.expires_at != stored_expires_at
        ):
            raise ReconciliationConflict("reconciliation_authority_conflict")
        revoked_at = (
            datetime.fromisoformat(row["revoked_at"]) if row["revoked_at"] is not None else None
        )
        return {
            "authorityBytes": authority_bytes.decode(),
            "authorityDigest": binding.authority_digest,
            "authority": authority.model_dump(by_alias=True, mode="json"),
            "revokedAt": revoked_at.isoformat() if revoked_at is not None else None,
        }

    def read_authority(self, execution_id: str) -> dict[str, object] | None:
        return self._authority(self._database_path(), execution_id)

    @staticmethod
    def _empty(path: Path) -> dict[str, bool]:
        with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as connection:
            retained = connection.execute(
                "SELECT EXISTS(SELECT 1 FROM job LIMIT 1) "
                "OR EXISTS(SELECT 1 FROM trellis_delivery_authorities LIMIT 1) "
                "OR EXISTS(SELECT 1 FROM trellis_job_correlations LIMIT 1) "
                "OR EXISTS(SELECT 1 FROM trellis_decision_enqueue_obligations_v1 "
                "WHERE consumed_at IS NULL LIMIT 1) "
                "OR EXISTS(SELECT 1 FROM job_checkpoints WHERE "
                "kind LIKE 'trellis-%obligation-v1:%' "
                "OR kind LIKE 'trellis-continuation-v1:%' LIMIT 1) "
                "OR EXISTS(SELECT 1 FROM execution_signals "
                "WHERE consumed_at IS NULL LIMIT 1)"
            ).fetchone()[0]
        return {"empty": not bool(retained)}

    def read_empty(self) -> dict[str, bool]:
        return self._empty(self._database_path())

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
