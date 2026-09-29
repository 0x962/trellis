from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from langflow.services.trellis_publications import ledger
from langflow.services.trellis_publications.contracts import InstalledPublicationPackage, PublicationRequest
from langflow.services.trellis_publications.validation import validate


async def payload(request: Request) -> tuple[PublicationRequest, bytes]:
    raw = await request.body()
    try:
        parsed = PublicationRequest.model_validate_json(raw)
        parsed.source()
    except (ValidationError, ValueError, TypeError, KeyError):
        raise HTTPException(422, "publication_request_invalid") from None
    return parsed, raw


def create_publication_router(package: InstalledPublicationPackage, *, require_transport_auth: Callable) -> APIRouter:
    router = APIRouter(prefix="/publications", tags=["Trellis publications"],
                       dependencies=[Depends(require_transport_auth)])

    @router.post("/validate")
    async def validate_document(request: Request):
        parsed, _ = await payload(request)
        return {"diagnostics": validate(parsed, package)}

    @router.post("")
    async def publish_document(request: Request):
        parsed, raw = await payload(request)
        return await ledger.publish(parsed, raw, package)

    @router.get("/{flow_id}/{revision}")
    async def read_publication(flow_id: str, revision: int):
        return await ledger.read(flow_id, revision)

    return router
