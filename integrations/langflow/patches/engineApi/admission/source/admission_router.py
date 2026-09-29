from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from langflow.services.trellis_v1.correlation import CorrelationUnknown, ProtocolConflict, _submission
from langflow.services.trellis_v1.engine_api import AuthorityConflict, AuthorityUnauthorized, EngineApiSecurity

from .admission_models import (
    Absent, Admitted, AdmissionUnknown, EngineKey, Found,
    OpenRequest, Pending, SubmitRequest, Unknown,
)
from .admission_service import AdmissionService


def create_admission_router(*, service: AdmissionService, security: EngineApiSecurity) -> APIRouter:
    router = APIRouter(prefix="/admission", dependencies=[Depends(security.require_transport_auth)])

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
            return await service.open(
                request.receiptBytes.encode("utf-8"), request.authorityBytes.encode("utf-8"),
                require_authority=security.require_authority,
            )
        except CorrelationUnknown:
            return AdmissionUnknown()
        except ProtocolConflict as error:
            raise HTTPException(409, str(error)) from error
        except (AuthorityConflict, AuthorityUnauthorized) as error:
            raise HTTPException(409, "admission_authority_refused") from error
        except UnicodeEncodeError as error:
            raise HTTPException(422, "admission_request_invalid") from error

    return router
