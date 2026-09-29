import hmac
import os
import stat
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import ValidationError

from langflow.services.trellis_publications import ledger
from langflow.services.trellis_publications.contracts import InstalledPublicationPackage, PublicationRequest
from langflow.services.trellis_publications.validation import validate

router = APIRouter(prefix="/trellis/publications", tags=["Trellis publications"])


def installed(request: Request, authorization: Annotated[str | None, Header()] = None) -> InstalledPublicationPackage:
    package = getattr(request.app.state, "trellis_publication_package", None)
    if not isinstance(package, InstalledPublicationPackage):
        raise HTTPException(503, "publication_package_unavailable")
    descriptor = os.open(package.authentication_file, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor) as file:
        metadata = os.fstat(file.fileno())
        if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise HTTPException(503, "publication_authentication_unavailable")
        token = file.read()
    if not token or not hmac.compare_digest(authorization or "", f"Bearer {token}"):
        raise HTTPException(401, "publication_authentication_required")
    return package


async def payload(request: Request) -> tuple[PublicationRequest, bytes]:
    raw = await request.body()
    try:
        parsed = PublicationRequest.model_validate_json(raw)
        parsed.source()
    except (ValidationError, ValueError, TypeError, KeyError):
        raise HTTPException(422, "publication_request_invalid") from None
    return parsed, raw


@router.post("/validate")
async def validate_document(request: Request, package: Annotated[InstalledPublicationPackage, Depends(installed)]):
    parsed, _ = await payload(request)
    return {"diagnostics": validate(parsed, package)}


@router.post("")
async def publish_document(request: Request, package: Annotated[InstalledPublicationPackage, Depends(installed)]):
    parsed, raw = await payload(request)
    return await ledger.publish(parsed, raw, package)


@router.get("/{flow_id}/{revision}")
async def read_publication(flow_id: str, revision: int,
                           package: Annotated[InstalledPublicationPackage, Depends(installed)]):
    return await ledger.read(flow_id, revision)
