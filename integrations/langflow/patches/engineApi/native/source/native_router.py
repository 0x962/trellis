from __future__ import annotations

from json import JSONDecodeError
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from starlette.responses import Response

from langflow.services.deps import session_scope
from langflow.services.trellis_v1.engine_api import AuthorityConflict, AuthorityUnauthorized, EngineApiSecurity
from langflow.services.trellis_v1.native_ledger import NativeCompletionLedger
from langflow.services.trellis_v1.native_protocol import CompletionInput, LookupInput, NativeConflict


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

    return router
