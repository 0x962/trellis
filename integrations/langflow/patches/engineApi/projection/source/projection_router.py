from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import select
from starlette.responses import JSONResponse

from langflow.services.database.models.jobs.model import Job
from langflow.services.trellis_v1.engine_api import AuthorityConflict, AuthorityUnauthorized, EngineApiSecurity
from langflow.services.trellis_v1.projection_reader import read_projection_checkpoint


class ProjectionReadInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    executionId: str = Field(min_length=1)
    publicationId: str = Field(min_length=1)
    engineJobId: str
    authorityBytes: str = Field(min_length=1)
    after: int = Field(ge=0)


def create_projection_router(*, security: EngineApiSecurity, open_session) -> APIRouter:
    router = APIRouter(prefix="/projection")

    @router.post("/read")
    async def read(request: Request, payload: ProjectionReadInput) -> JSONResponse:
        await security.require_transport_auth(request.headers.get("authorization"))
        try:
            job_id = UUID(payload.engineJobId)
            async with open_session() as session:
                job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).first()
                if job is None:
                    raise HTTPException(status_code=404, detail="projection_job_missing")
                grant = await security.require_authority(
                    session, payload.authorityBytes.encode("utf-8"), "events.append",
                    execution_id=payload.executionId, publication_id=payload.publicationId, engine_job_id=job_id,
                )
                if request.headers.get("x-trellis-capability-id") != grant.authority.capability_id:
                    raise AuthorityUnauthorized("projection_capability_conflict")
                result = await read_projection_checkpoint(
                    session, job_id, after=payload.after, engine_epoch=grant.engine_epoch,
                )
            return JSONResponse(content={**result, "authorityDigest": grant.authority_digest},
                                headers={"Cache-Control": "no-store"})
        except AuthorityUnauthorized as error:
            raise HTTPException(status_code=401, detail="projection_authority_invalid") from error
        except AuthorityConflict as error:
            raise HTTPException(status_code=409, detail="projection_authority_conflict") from error
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    return router
