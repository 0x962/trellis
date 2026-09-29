from __future__ import annotations

import hmac
from pathlib import Path
from typing import Annotated, Callable
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from starlette.responses import FileResponse

from langflow.services.trellis_v1.backup import (
    EngineSnapshotReceipt,
    SnapshotBinding,
    export_engine_snapshot,
)


def create_backup_router(*, database, settings, export_root: Path, authentication_file: Path,
                         package_digest: str, data_home_id: str, host_id: str,
                         snapshot_boundary: Callable) -> APIRouter:
    token = authentication_file.read_text()
    if not token:
        raise ValueError("engine_snapshot_authentication_missing")
    if export_root.is_symlink() or export_root.stat().st_mode & 0o777 != 0o700:
        raise ValueError("engine_snapshot_export_root_not_private")

    async def authenticate(authorization: Annotated[str | None, Header()] = None) -> None:
        if authorization is None or not hmac.compare_digest(authorization, f"Bearer {token}"):
            raise HTTPException(status_code=401, detail="engine_snapshot_unauthorized")

    router = APIRouter(prefix="/trellis-v1/snapshots", dependencies=[Depends(authenticate)])

    @router.post("", response_model=EngineSnapshotReceipt)
    async def capture(binding: SnapshotBinding) -> EngineSnapshotReceipt:
        async with snapshot_boundary(binding):
            return await export_engine_snapshot(
                database, settings, export_root, binding,
                package_digest=package_digest, data_home_id=data_home_id, host_id=host_id,
            )

    @router.get("/{snapshot_id}/{part}")
    async def download(snapshot_id: UUID, part: str) -> FileResponse:
        names = {"database": "database.sqlite", "secret": "secret"}
        if part not in names:
            raise HTTPException(status_code=404, detail="engine_snapshot_part_not_found")
        directory = export_root / str(snapshot_id)
        EngineSnapshotReceipt.model_validate_json((directory / "receipt.json").read_bytes())
        return FileResponse(directory / names[part], media_type="application/octet-stream",
                            headers={"Cache-Control": "no-store"})

    return router
