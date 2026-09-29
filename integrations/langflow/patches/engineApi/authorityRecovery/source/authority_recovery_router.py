from __future__ import annotations

import hmac
import os
import stat
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import ValidationError

from langflow.services.trellis_v1.authority_recovery_models import (
    RecoveryConflict,
    RecoveryInvalid,
    RecoveryMissing,
    RecoveryRequest,
)
from langflow.services.trellis_v1.authority_recovery_store import recover_initial_authority
from langflow.services.trellis_v1.engine_api import AuthoritySession, EngineApiSecurity


def _issuer(path: Path) -> bytes:
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_nlink != 1
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or metadata.st_uid != os.getuid()
        ):
            raise ValueError("authority_recovery_issuer_unsafe")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            value = source.read()
    finally:
        os.close(descriptor)
    if not value:
        raise ValueError("authority_recovery_issuer_missing")
    value.decode("utf-8")
    return value


def create_authority_recovery_router(
    *,
    security: EngineApiSecurity,
    open_session: AuthoritySession,
    issuer_file: Path,
) -> APIRouter:
    issuer = _issuer(issuer_file)

    async def authenticate(
        supplied: Annotated[str | None, Header(alias="X-Trellis-Authority-Recovery-Issuer")] = None,
    ) -> None:
        if supplied is None or not hmac.compare_digest(supplied.encode(), issuer):
            raise HTTPException(status_code=401, detail="authority_recovery_issuer_unauthorized")

    router = APIRouter(prefix="/authority", dependencies=[Depends(authenticate)])

    @router.post("/recover-initial")
    async def recover_initial(request: Request) -> Response:
        request_bytes = await request.body()
        try:
            input = RecoveryRequest.model_validate_json(request_bytes, strict=True)
            async with open_session() as session:
                response_bytes = await recover_initial_authority(
                    session,
                    request=input,
                    request_bytes=request_bytes,
                    identity=security.identity,
                )
                await session.commit()
        except RecoveryMissing as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except RecoveryConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except (RecoveryInvalid, ValidationError) as error:
            raise HTTPException(status_code=422, detail="initial_recovery_request_invalid") from error
        return Response(content=response_bytes, media_type="application/json")

    return router
