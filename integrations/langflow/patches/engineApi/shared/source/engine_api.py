from __future__ import annotations

import hmac
import os
import stat
from contextlib import AbstractAsyncContextManager
from datetime import datetime
from pathlib import Path
from typing import Annotated, Callable, Iterable
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from langflow.services.trellis_v1.authority import (
    AuthorityConflict,
    AuthorityUnauthorized,
    EngineAuthorityBinding,
    EngineAuthorityState,
    Permission,
    commit_authority,
    require_authority,
    read_authority,
    revoke_authority,
)


class EngineApiIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    instance_id: UUID = Field(alias="instanceId")
    data_home_id: str = Field(alias="dataHomeId", min_length=1)
    host_id: str = Field(alias="hostId", min_length=1)
    manifest_digest: str = Field(alias="manifestDigest", pattern=r"^[0-9a-f]{64}$")
    owner_id: str = Field(alias="ownerId", min_length=1)


def load_engine_api_identity() -> EngineApiIdentity:
    return EngineApiIdentity.model_validate(
        {
            "instanceId": os.environ["TRELLIS_INSTANCE_ID"],
            "dataHomeId": os.environ["TRELLIS_DATA_HOME_ID"],
            "hostId": os.environ["TRELLIS_HOST_ID"],
            "ownerId": os.environ["TRELLIS_OWNER_ID"],
            "manifestDigest": os.environ["TRELLIS_MANIFEST_DIGEST"],
        }
    )


class TransportUnauthorized(HTTPException):
    def __init__(self) -> None:
        super().__init__(status_code=401, detail="engine_api_unauthorized", headers={"WWW-Authenticate": "Bearer"})


class EngineApiSecurity:
    def __init__(self, *, authentication_file: Path, identity: EngineApiIdentity) -> None:
        metadata = authentication_file.lstat()
        if authentication_file.is_symlink() or not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise ValueError("engine_api_authentication_file_not_private")
        token = authentication_file.read_bytes().decode("utf-8")
        if not token:
            raise ValueError("engine_api_authentication_missing")
        self._token = token
        self.identity = identity

    async def require_transport_auth(
        self,
        authorization: Annotated[str | None, Header()] = None,
    ) -> EngineApiIdentity:
        if authorization is None or not hmac.compare_digest(authorization, f"Bearer {self._token}"):
            raise TransportUnauthorized()
        return self.identity

    async def require_authority(
        self,
        session: AsyncSession,
        authority_bytes: bytes,
        permission: Permission,
        *,
        execution_id: str,
        publication_id: str,
        engine_job_id: UUID,
    ) -> EngineAuthorityBinding:
        return await require_authority(
            session,
            authority_bytes,
            permission,
            execution_id=execution_id,
            publication_id=publication_id,
            engine_job_id=engine_job_id,
        )


class AuthorityCommitInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    authority_bytes: str = Field(alias="authorityBytes", min_length=1)
    expected_capability_id: str | None = Field(alias="expectedCapabilityId")


class AuthorityRevokeInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    execution_id: str = Field(alias="executionId", min_length=1)
    expected_capability_id: str = Field(alias="expectedCapabilityId", min_length=1)
    revoked_at: datetime = Field(alias="revokedAt")


AuthoritySession = Callable[[], AbstractAsyncContextManager[AsyncSession]]


def _binding_response(binding: EngineAuthorityBinding) -> dict[str, object]:
    return {
        "authorityBytes": binding.authority_bytes.decode(),
        "authorityDigest": binding.authority_digest,
        "authority": binding.authority.model_dump(by_alias=True, mode="json"),
    }


def _state_response(state: EngineAuthorityState) -> dict[str, object]:
    return {
        **_binding_response(state.binding),
        "revokedAt": state.revoked_at.isoformat() if state.revoked_at is not None else None,
    }


def create_engine_api_router(
    *,
    security: EngineApiSecurity,
    authority_session: AuthoritySession,
    domain_routers: Iterable[APIRouter],
) -> APIRouter:
    router = APIRouter(
        prefix="/trellis-v1",
        dependencies=[Depends(security.require_transport_auth)],
    )

    @router.get("/health")
    async def health(
        challenge: Annotated[UUID, Query()],
        header_challenge: Annotated[str, Header(alias="X-Trellis-Challenge")],
    ) -> dict[str, object]:
        if not hmac.compare_digest(str(challenge), header_challenge):
            raise HTTPException(status_code=409, detail="engine_api_challenge_conflict")
        return {
            "status": "healthy",
            "challenge": str(challenge),
            "identity": security.identity.model_dump(by_alias=True),
        }

    @router.post("/authority/commit")
    async def commit(input: AuthorityCommitInput) -> dict[str, object]:
        try:
            async with authority_session() as session:
                binding = await commit_authority(
                    session,
                    input.authority_bytes.encode(),
                    expected_capability_id=input.expected_capability_id,
                )
                await session.commit()
        except (AuthorityConflict, AuthorityUnauthorized) as error:
            raise HTTPException(status_code=409, detail="engine_authority_conflict") from error
        return _binding_response(binding)

    @router.post("/authority/revoke")
    async def revoke(input: AuthorityRevokeInput) -> dict[str, bool]:
        try:
            async with authority_session() as session:
                await revoke_authority(
                    session,
                    input.execution_id,
                    expected_capability_id=input.expected_capability_id,
                    revoked_at=input.revoked_at,
                )
                await session.commit()
        except AuthorityConflict as error:
            raise HTTPException(status_code=409, detail="engine_authority_conflict") from error
        return {"revoked": True}

    @router.get("/authority/{execution_id}")
    async def lookup(execution_id: str) -> dict[str, object]:
        try:
            async with authority_session() as session:
                state = await read_authority(session, execution_id)
        except AuthorityConflict as error:
            raise HTTPException(status_code=409, detail="engine_authority_conflict") from error
        if state is None:
            raise HTTPException(status_code=404, detail="engine_authority_not_found")
        return _state_response(state)

    for domain_router in domain_routers:
        router.include_router(domain_router)
    return router
