from __future__ import annotations

from json import JSONDecodeError
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from starlette.responses import Response

from langflow.services.deps import session_scope
from langflow.services.trellis_v1.native_ledger import NativeCompletionLedger
from langflow.services.trellis_v1.native_protocol import CompletionInput, NativeConflict


def create_native_router(*, jobs, executor, authorize, open_session=session_scope) -> APIRouter:
    ledger = NativeCompletionLedger(jobs, open_session=open_session)
    router = APIRouter(prefix="/trellis-v1/native")

    @router.post("/completions")
    async def complete(request: Request, payload: CompletionInput) -> Response:
        async def current_authority(binding):
            return await authorize(request, "completion.deliver", binding)

        try:
            obligation = await ledger.accept(payload, current_authority)
        except NativeConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except (ValidationError, JSONDecodeError, UnicodeError) as error:
            raise HTTPException(status_code=422, detail="native_completion_invalid") from error
        await executor.consume_external_completion_obligation(obligation)
        return Response(content=obligation["receiptBytes"], media_type="application/json", headers={"Cache-Control": "no-store"})

    @router.get("/jobs/{job_id}/waits/{wait_id}")
    async def observe(request: Request, job_id: UUID, wait_id: str) -> dict:
        async def current_authority(binding):
            return await authorize(request, "native.read", binding)

        try:
            return await ledger.observe(job_id, wait_id, current_authority)
        except NativeConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    return router
