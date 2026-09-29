from __future__ import annotations

import hashlib

from pydantic import BaseModel, ConfigDict
from sqlalchemy import text


class EngineSnapshotCompatibility(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sourceDataHomeId: str
    sourceHostId: str
    enginePackageDigest: str
    engineDatabaseVersion: str
    revisions: list[str]
    secretVersion: str


async def read_snapshot_compatibility(database, settings, *, package_digest: str,
                                      data_home_id: str, host_id: str) -> EngineSnapshotCompatibility:
    if database.engine.dialect.name != "sqlite":
        raise ValueError("engine_snapshot_database_unsupported")
    async with database.engine.connect() as connection:
        revisions = sorted((await connection.execute(text("SELECT version_num FROM alembic_version"))).scalars())
    if not revisions:
        raise ValueError("engine_snapshot_database_version_missing")
    secret = settings.auth_settings.SECRET_KEY.get_secret_value().encode("utf-8")
    return EngineSnapshotCompatibility(
        sourceDataHomeId=data_home_id, sourceHostId=host_id, enginePackageDigest=package_digest,
        engineDatabaseVersion=",".join(revisions), revisions=revisions,
        secretVersion=hashlib.sha256(secret).hexdigest(),
    )
