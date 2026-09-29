from __future__ import annotations

import hashlib
import hmac
import os
from pathlib import Path
from typing import Annotated, Awaitable, Callable
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from langflow.services.trellis_v1.capture_boundary import CaptureBoundary
from langflow.services.trellis_v1.capture_store import CaptureGrantStore
from langflow.services.trellis_v1.reconciliation_models import (
    LiveEngineIdentity,
    ReconciliationConflict,
    ReconciliationMissing,
    ReconciliationRecord,
)


class AcquireInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    lease_bytes: str = Field(alias="leaseBytes", min_length=1)


class ReleaseInput(AcquireInput):
    acknowledgement_bytes: str = Field(alias="acknowledgementBytes", min_length=1)


def create_reconciliation_router(
    *,
    boundary: CaptureBoundary,
    reader,
    issuer_file: Path,
    after_release: Callable[[], Awaitable[None]],
) -> APIRouter:
    descriptor = os.open(issuer_file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        CaptureGrantStore._private_file(descriptor)
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            issuer = source.read()
    finally:
        os.close(descriptor)
    if not issuer:
        raise ValueError("reconciliation_issuer_missing")
    issuer.decode("utf-8")
    if boundary.reconciliation_store.issuer_digest != hashlib.sha256(issuer).hexdigest():
        raise ValueError("reconciliation_issuer_digest_conflict")

    async def authenticate(
        supplied: Annotated[str | None, Header(alias="X-Trellis-Reconciliation-Issuer")] = None,
    ):
        if supplied is None or not hmac.compare_digest(supplied.encode("utf-8"), issuer):
            raise HTTPException(status_code=401, detail="reconciliation_issuer_unauthorized")

    router = APIRouter(prefix="/reconciliation-leases", dependencies=[Depends(authenticate)])

    @router.post("", response_model=ReconciliationRecord)
    async def acquire(input: AcquireInput):
        try:
            return await boundary.acquire_reconciliation(input.lease_bytes, reader)
        except ReconciliationConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except (ValidationError, ValueError) as error:
            raise HTTPException(status_code=422, detail="reconciliation_lease_invalid") from error

    @router.get("/{lease_id}", response_model=ReconciliationRecord)
    async def read(lease_id: UUID):
        try:
            return await boundary.read_reconciliation(lease_id)
        except ReconciliationMissing as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ReconciliationConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @router.get("/{lease_id}/identity", response_model=LiveEngineIdentity)
    async def read_identity(lease_id: UUID):
        try:
            return await boundary.read_reconciliation_identity(lease_id, reader)
        except ReconciliationMissing as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ReconciliationConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @router.post("/{lease_id}/release", response_model=ReconciliationRecord)
    async def release(lease_id: UUID, input: ReleaseInput):
        try:
            receipt = await boundary.release_reconciliation(
                lease_id,
                input.lease_bytes,
                input.acknowledgement_bytes,
            )
            await after_release()
            return receipt
        except ReconciliationMissing as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ReconciliationConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except (ValidationError, ValueError) as error:
            raise HTTPException(status_code=422, detail="reconciliation_release_invalid") from error

    return router
