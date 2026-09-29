from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import ValidationError

from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.trellis_v1.decision_api_models import (
    DecisionAcceptance,
    DecisionAcceptRequest,
    DecisionLookupRequest,
    DecisionLookupResult,
)
from langflow.services.trellis_v1.decisions import (
    DecisionConflictError,
    DecisionNotPendingError,
    HumanDecisionReceiptV1,
)
from langflow.services.trellis_v1.engine_api import (
    AuthorityConflict,
    AuthorityUnauthorized,
    EngineApiSecurity,
    TransportUnauthorized,
)


def create_decision_router(
    *, security: EngineApiSecurity, execution_service: BackgroundExecutionService
) -> APIRouter:
    async def authenticate(authorization: Annotated[str | None, Header()] = None):
        try:
            return await security.require_transport_auth(authorization)
        except TransportUnauthorized as error:
            raise HTTPException(
                status_code=401,
                detail="engine_transport_unauthorized",
                headers={"WWW-Authenticate": "Bearer"},
            ) from error

    router = APIRouter(prefix="/decisions", dependencies=[Depends(authenticate)])

    @router.post("/lookup", response_model=DecisionLookupResult)
    async def lookup(request: DecisionLookupRequest):
        return await execution_service.lookup_trellis_human_decision(
            execution_id=request.execution_id,
            engine_job_id=request.engine_job_id,
            engine_request_id=request.engine_request_id,
            decision_id=request.decision_id,
            payload_digest=request.payload_digest,
        )

    @router.post("/accept", response_model=DecisionAcceptance)
    async def accept(request: DecisionAcceptRequest):
        try:
            decision_bytes = request.decision_bytes.encode("utf-8")
            authority_bytes = request.authority_bytes.encode("utf-8")
            decision = HumanDecisionReceiptV1.model_validate_json(decision_bytes, strict=True)
        except (UnicodeEncodeError, ValidationError) as error:
            raise HTTPException(status_code=422, detail="decision_request_invalid") from error
        try:
            return await execution_service.accept_trellis_human_decision(
                engine_job_id=decision.wait.engine_job_id,
                decision_bytes=decision_bytes,
                payload_digest=request.payload_digest,
                authority_bytes=authority_bytes,
            )
        except (AuthorityUnauthorized, AuthorityConflict) as error:
            raise HTTPException(status_code=409, detail="decision_authority_refused") from error
        except DecisionConflictError as error:
            raise HTTPException(status_code=409, detail="decision_conflict") from error
        except DecisionNotPendingError as error:
            raise HTTPException(status_code=409, detail="decision_not_pending") from error

    return router
