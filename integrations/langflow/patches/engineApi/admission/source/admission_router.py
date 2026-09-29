from __future__ import annotations

import hmac
from contextlib import AbstractAsyncContextManager
from pathlib import Path
from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import ValidationError

from langflow.services.trellis_v1.correlation import CorrelationUnknown, ProtocolConflict, _submission

from .admission_models import (
    Absent, Admitted, AdmissionUnknown, EngineKey, Found,
    OpenRequest, Pending, SubmitRequest, Unknown,
)
from .admission_service import AdmissionService


class AdmissionAuthority(Protocol):
    def guard(self, authority: dict, *, permission: str) -> AbstractAsyncContextManager[None]:
        """Hold the current owner, epoch, and capability valid through the admission commit."""
        ...


def create_admission_router(*, authentication_file: Path, service: AdmissionService,
                            authority: AdmissionAuthority) -> APIRouter:
    token = authentication_file.read_bytes()
    if not token:
        raise ValueError("admission_authentication_missing")

    async def authenticate(authorization: Annotated[str | None, Header()] = None) -> None:
        if authorization is None or not hmac.compare_digest(authorization.encode("utf-8"), b"Bearer " + token):
            raise HTTPException(401, "admission_unauthorized", headers={"WWW-Authenticate": "Bearer"})

    router = APIRouter(prefix="/trellis-v1/admission", dependencies=[Depends(authenticate)])

    @router.post("/lookup", response_model=Found | Absent | Unknown)
    async def lookup(key: EngineKey):
        try:
            return await service.lookup(key)
        except CorrelationUnknown:
            return Unknown(key=key)
        except ProtocolConflict as error:
            raise HTTPException(409, str(error)) from error

    @router.post("/submit", response_model=Found | Unknown)
    async def submit(request: SubmitRequest):
        try:
            envelope = request.envelopeBytes.encode("utf-8")
            submission = _submission(envelope)
            key = EngineKey(version=1, hostId=submission["hostId"], executionId=submission["executionId"])
            return await service.submit(envelope, request.payloadBytes.encode("utf-8"))
        except CorrelationUnknown:
            return Unknown(key=key)
        except ProtocolConflict as error:
            raise HTTPException(409, str(error)) from error
        except (ValidationError, UnicodeEncodeError) as error:
            raise HTTPException(422, "admission_request_invalid") from error

    @router.post("/open", response_model=Admitted | Pending | AdmissionUnknown)
    async def open_admission(request: OpenRequest):
        try:
            async with authority.guard(request.authority.model_dump(), permission="native.reserve"):
                return await service.open(request.receiptBytes.encode("utf-8"), request.authority)
        except CorrelationUnknown:
            return AdmissionUnknown()
        except ProtocolConflict as error:
            raise HTTPException(409, str(error)) from error
        except UnicodeEncodeError as error:
            raise HTTPException(422, "admission_request_invalid") from error

    return router
