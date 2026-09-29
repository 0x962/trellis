from __future__ import annotations

import asyncio
import hmac
import os
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import ValidationError

from langflow.services.trellis_v1.capture_boundary import CaptureBoundary
from langflow.services.trellis_v1.capture_grants import (
    CaptureConflict, CaptureMissing, CaptureModel, CaptureReceipt, Text,
)
from langflow.services.trellis_v1.capture_store import CaptureGrantStore


class CaptureInput(CaptureModel):
    grantBytes: Text


def create_capture_authority_router(*, boundary: CaptureBoundary, issuer_file: Path) -> APIRouter:
    descriptor = os.open(issuer_file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        CaptureGrantStore._private_file(descriptor)
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            issuer = source.read()
    finally:
        os.close(descriptor)
    if not issuer:
        raise ValueError("capture_issuer_missing")
    issuer.decode("utf-8")

    async def authenticate(
        supplied: Annotated[str | None, Header(alias="X-Trellis-Capture-Issuer")] = None,
    ):
        if supplied is None or not hmac.compare_digest(supplied.encode("utf-8"), issuer):
            raise HTTPException(status_code=401, detail="capture_issuer_unauthorized")

    router = APIRouter(prefix="/capture-authorities", dependencies=[Depends(authenticate)])

    @router.post("", response_model=CaptureReceipt)
    async def commit(input: CaptureInput):
        try:
            return await boundary.commit(input.grantBytes)
        except CaptureConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except (ValidationError, ValueError) as error:
            raise HTTPException(status_code=422, detail="capture_grant_invalid") from error

    @router.get("/{grant_id}", response_model=CaptureReceipt)
    async def read(grant_id: UUID):
        try:
            return await asyncio.to_thread(boundary.store.read, grant_id)
        except CaptureMissing as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except CaptureConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @router.post("/{grant_id}/revoke", response_model=CaptureReceipt)
    async def revoke(grant_id: UUID, input: CaptureInput):
        try:
            return await boundary.revoke(grant_id, input.grantBytes)
        except CaptureConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except (ValidationError, ValueError) as error:
            raise HTTPException(status_code=422, detail="capture_grant_invalid") from error

    return router
