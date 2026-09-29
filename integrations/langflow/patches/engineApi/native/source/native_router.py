from __future__ import annotations

from json import JSONDecodeError
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from sqlmodel import select
from starlette.responses import JSONResponse, Response

from langflow.services.database.models.jobs.model import Job

from langflow.services.deps import session_scope
from langflow.services.trellis_v1.engine_api import AuthorityConflict, AuthorityUnauthorized, EngineApiSecurity
from langflow.services.trellis_v1.native_ledger import NativeCompletionLedger
from langflow.services.trellis_v1.native_protocol import (
    CompletionInput, InputReceiptsInput, LaunchBinding, LookupInput, NativeConflict, read_json,
)
from langflow.services.trellis_v1.occurrence_journal import OccurrenceConflict
from langflow.services.trellis_v1.occurrence_receipts import read_input_receipts


def create_native_router(*, jobs, executor, security: EngineApiSecurity, open_session=session_scope) -> APIRouter:
    ledger = NativeCompletionLedger(jobs, open_session=open_session)
    router = APIRouter(prefix="/native")

    def authorize(request: Request, authority_bytes: str, permission: str):
        async def current_authority(session, binding):
            grant = await security.require_authority(
                session, authority_bytes.encode("utf-8"), permission,
                execution_id=binding["executionId"], publication_id=binding["publicationId"],
                engine_job_id=UUID(binding["engineJobId"]),
            )
            if request.headers.get("x-trellis-capability-id") != grant.authority.capability_id:
                raise AuthorityUnauthorized("native_capability_conflict")
            return grant.authority.model_dump(by_alias=True, mode="json")
        return current_authority

    @router.post("/completions")
    async def complete(request: Request, payload: CompletionInput) -> Response:
        await security.require_transport_auth(request.headers.get("authorization"))
        try:
            obligation = await ledger.accept(payload, authorize(request, payload.authorityBytes, "completion.deliver"))
        except (NativeConflict, AuthorityConflict) as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except AuthorityUnauthorized as error:
            raise HTTPException(status_code=401, detail="native_authority_invalid") from error
        except (ValidationError, JSONDecodeError, UnicodeError) as error:
            raise HTTPException(status_code=422, detail="native_completion_invalid") from error
        await executor.consume_external_completion_obligation(obligation)
        return Response(content=obligation["receiptBytes"], media_type="application/json", headers={"Cache-Control": "no-store"})

    @router.post("/lookup")
    async def observe(request: Request, payload: LookupInput) -> dict:
        await security.require_transport_auth(request.headers.get("authorization"))
        try:
            return await ledger.observe(UUID(payload.jobId), payload.waitId, authorize(request, payload.authorityBytes, "native.read"))
        except (NativeConflict, AuthorityConflict) as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except AuthorityUnauthorized as error:
            raise HTTPException(status_code=401, detail="native_authority_invalid") from error

    @router.post("/input-receipts")
    async def input_receipts(request: Request, payload: InputReceiptsInput) -> JSONResponse:
        await security.require_transport_auth(request.headers.get("authorization"))
        try:
            original = read_json(payload.requestBytes)
            binding = LaunchBinding.model_validate({field: original.get(field) for field in LaunchBinding.model_fields})
            job_id = UUID(binding.engineJobId)
            async with open_session() as session:
                job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).first()
                if job is None:
                    raise NativeConflict("native_job_missing")
                await authorize(request, payload.authorityBytes, "native.read")(session, binding.model_dump())
                receipts = await read_input_receipts(session, job_id, payload.requestBytes)
            return JSONResponse(content=receipts, headers={"Cache-Control": "no-store"})
        except (NativeConflict, OccurrenceConflict, AuthorityConflict) as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except AuthorityUnauthorized as error:
            raise HTTPException(status_code=401, detail="native_authority_invalid") from error
        except (ValidationError, JSONDecodeError, UnicodeError) as error:
            raise HTTPException(status_code=422, detail="native_request_invalid") from error

    return router
