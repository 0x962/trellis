from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.trellis_v1.authority import AuthorityConflict, AuthorityUnauthorized
from langflow.services.trellis_v1.cancellation_effects import cancel_execution
from langflow.services.trellis_v1.cancellation_models import CancellationConflict, CancellationInput, CancellationMissing
from langflow.services.trellis_v1.engine_api import AuthoritySession, EngineApiSecurity


def create_cancellation_router(
    *,
    security: EngineApiSecurity,
    sessions: AuthoritySession,
    background: BackgroundExecutionService,
) -> APIRouter:
    router = APIRouter(prefix="/cancellation")

    @router.post("")
    async def cancel(
        input: CancellationInput,
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        await security.require_transport_auth(authorization)
        try:
            receipt, status = await cancel_execution(sessions, background, security, input)
        except AuthorityUnauthorized as error:
            raise HTTPException(status_code=403, detail=str(error)) from error
        except (CancellationConflict, AuthorityConflict) as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except CancellationMissing as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        return {"receipt": receipt.model_dump(by_alias=True, mode="json"), "engineStatus": status.value}

    return router
