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
    SnapshotConflict,
    SnapshotMissing,
    capture_engine_snapshot,
    snapshot_file,
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
            raise HTTPException(status_code=401, detail="engine_snapshot_unauthorized",
                                headers={"WWW-Authenticate": "Bearer"})

    router = APIRouter(prefix="/snapshots", dependencies=[Depends(authenticate)])

    @router.post("", response_model=EngineSnapshotReceipt)
    async def capture(binding: SnapshotBinding) -> EngineSnapshotReceipt:
        try:
            return await capture_engine_snapshot(
                database, settings, export_root, binding,
                package_digest=package_digest, data_home_id=data_home_id, host_id=host_id,
                snapshot_boundary=snapshot_boundary,
            )
        except SnapshotConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @router.get("/{snapshot_id}/{part}")
    async def download(snapshot_id: UUID, part: str) -> FileResponse:
        try:
            path = snapshot_file(export_root, snapshot_id, part)
        except SnapshotMissing as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except SnapshotConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return FileResponse(path, media_type="application/octet-stream", headers={"Cache-Control": "no-store"})

    return router
