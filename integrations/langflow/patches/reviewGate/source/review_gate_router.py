from json import JSONDecodeError
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, StrictStr, ValidationError
from starlette.responses import Response

from langflow.services.deps import session_scope
from langflow.services.trellis_v1.engine_api import AuthorityConflict, AuthorityUnauthorized, EngineApiSecurity
from langflow.services.trellis_v1.review_classifications import ReviewClassificationLedger
from langflow.services.trellis_v1.review_protocol import ReviewConflict, ReviewDeliveryInput, read_review_visit

from .occurrence_journal import OccurrenceConflict
from .review_gate_reader import read_review_visits


class ReviewVisitLookup(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    requestBytes: StrictStr
    authorityBytes: StrictStr


def create_review_gate_router(*, jobs, executor, security: EngineApiSecurity, open_session=session_scope):
    ledger = ReviewClassificationLedger(jobs, open_session=open_session)
    router = APIRouter(prefix="/review-classifications")

    def authorize(request, authority_bytes, permission):
        async def current(session, binding):
            grant = await security.require_authority(
                session, authority_bytes, permission,
                execution_id=binding["executionId"], publication_id=binding["publicationId"],
                engine_job_id=UUID(binding["engineJobId"]),
            )
            if request.headers.get("x-trellis-capability-id") != grant.authority.capability_id:
                raise AuthorityUnauthorized("review_capability_conflict")
            return grant.authority.model_dump(by_alias=True, mode="json")
        return current

    @router.post("/visits")
    async def visits(request: Request, payload: ReviewVisitLookup):
        await security.require_transport_auth(request.headers.get("authorization"))
        try:
            visit = read_review_visit(payload.requestBytes)
            async with open_session() as session:
                result = await read_review_visits(session, payload.requestBytes)
                await authorize(request, payload.authorityBytes.encode("utf-8"), "review.classify")(
                    session, visit.model_dump(mode="json"),
                )
                return result
        except AuthorityUnauthorized as error:
            raise HTTPException(401, "review_authority_invalid") from error
        except (AuthorityConflict, OccurrenceConflict, ReviewConflict) as error:
            raise HTTPException(409, str(error)) from error
        except (ValidationError, JSONDecodeError, UnicodeError) as error:
            raise HTTPException(422, "review_visit_invalid") from error

    @router.post("/accept")
    async def accept(request: Request, payload: ReviewDeliveryInput):
        await security.require_transport_auth(request.headers.get("authorization"))
        try:
            obligation = await ledger.accept(payload, authorize(request, payload.authorityBytes, "classification.deliver"))
        except AuthorityUnauthorized as error:
            raise HTTPException(401, "review_authority_invalid") from error
        except (AuthorityConflict, ReviewConflict) as error:
            raise HTTPException(409, str(error)) from error
        except (ValidationError, JSONDecodeError, UnicodeError) as error:
            raise HTTPException(422, "review_delivery_invalid") from error
        await executor.consume_review_classification_obligation(obligation)
        return Response(content=obligation["receiptBytes"], media_type="application/json",
                        headers={"Cache-Control": "no-store"})

    return router
