from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field as PydanticField, model_validator
from sqlalchemy import Column, DateTime, LargeBinary, Text, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Field, SQLModel

Permission = Literal[
    "native.reserve",
    "native.read",
    "completion.deliver",
    "classification.deliver",
    "decision.deliver",
    "events.append",
    "execution.cancel",
    "review.classify",
]
REFERENCE_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"


class AuthorityUnauthorized(RuntimeError):
    pass


class AuthorityConflict(RuntimeError):
    pass


class DeliveryAuthority(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    version: Literal[1]
    execution_id: str = PydanticField(alias="executionId", pattern=REFERENCE_PATTERN)
    publication_id: str = PydanticField(alias="publicationId", pattern=REFERENCE_PATTERN)
    engine_job_id: UUID = PydanticField(alias="engineJobId")
    engine_epoch: int = PydanticField(alias="engineEpoch", ge=1)
    host_id: str = PydanticField(alias="hostId", pattern=REFERENCE_PATTERN)
    project_id: str = PydanticField(alias="projectId", pattern=REFERENCE_PATTERN)
    publication_digest: str = PydanticField(alias="publicationDigest", pattern=r"^[0-9a-f]{64}$")
    owner_id: str = PydanticField(alias="ownerId", pattern=REFERENCE_PATTERN)
    ownership_revision: int = PydanticField(alias="ownershipRevision", ge=1)
    capability_id: str = PydanticField(alias="capabilityId", pattern=REFERENCE_PATTERN)
    permissions: tuple[Permission, ...] = PydanticField(min_length=1)
    issued_at: datetime = PydanticField(alias="issuedAt")
    expires_at: datetime = PydanticField(alias="expiresAt")

    @model_validator(mode="after")
    def validate_timestamps(self) -> DeliveryAuthority:
        if self.issued_at.tzinfo is None or self.expires_at.tzinfo is None:
            raise ValueError("authority_timestamp_timezone_required")
        return self


class TrellisDeliveryAuthority(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "trellis_delivery_authorities"

    execution_id: str = Field(sa_column=Column(Text, primary_key=True))
    authority_bytes: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    authority_digest: str = Field(sa_column=Column(Text, nullable=False))
    publication_id: str = Field(sa_column=Column(Text, nullable=False))
    engine_job_id: UUID = Field(index=True, unique=True)
    engine_epoch: int = Field(nullable=False)
    host_id: str = Field(sa_column=Column(Text, nullable=False))
    owner_id: str = Field(sa_column=Column(Text, nullable=False))
    ownership_revision: int = Field(nullable=False)
    capability_id: str = Field(sa_column=Column(Text, nullable=False, unique=True))
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    revoked_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


@dataclass(frozen=True)
class EngineAuthorityBinding:
    authority: DeliveryAuthority
    authority_bytes: bytes
    authority_digest: str

    @property
    def engine_epoch(self) -> int:
        return self.authority.engine_epoch


@dataclass(frozen=True)
class EngineAuthorityState:
    binding: EngineAuthorityBinding
    revoked_at: datetime | None


def parse_authority(authority_bytes: bytes) -> EngineAuthorityBinding:
    try:
        value = json.loads(authority_bytes)
        authority = DeliveryAuthority.model_validate(value)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise AuthorityUnauthorized("invalid_authority") from error
    if authority.expires_at <= authority.issued_at or len(set(authority.permissions)) != len(authority.permissions):
        raise AuthorityUnauthorized("invalid_authority")
    return EngineAuthorityBinding(
        authority=authority,
        authority_bytes=authority_bytes,
        authority_digest=hashlib.sha256(authority_bytes).hexdigest(),
    )


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _stored_binding(current: TrellisDeliveryAuthority) -> EngineAuthorityBinding:
    binding = parse_authority(current.authority_bytes)
    authority = binding.authority
    if (
        binding.authority_digest != current.authority_digest
        or authority.execution_id != current.execution_id
        or authority.publication_id != current.publication_id
        or authority.engine_job_id != current.engine_job_id
        or authority.engine_epoch != current.engine_epoch
        or authority.host_id != current.host_id
        or authority.owner_id != current.owner_id
        or authority.ownership_revision != current.ownership_revision
        or authority.capability_id != current.capability_id
        or authority.expires_at != _utc(current.expires_at)
    ):
        raise AuthorityConflict("stored_authority_conflict")
    return binding


async def _lock_authority(session: AsyncSession, execution_id: str) -> TrellisDeliveryAuthority | None:
    result = await session.execute(
        select(TrellisDeliveryAuthority)
        .where(TrellisDeliveryAuthority.execution_id == execution_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def require_authority(
    session: AsyncSession,
    authority_bytes: bytes,
    permission: Permission,
    *,
    execution_id: str,
    publication_id: str,
    engine_job_id: UUID,
) -> EngineAuthorityBinding:
    binding = parse_authority(authority_bytes)
    current = await _lock_authority(session, execution_id)
    authority = binding.authority
    if current is None:
        raise AuthorityUnauthorized("authority_absent")
    _stored_binding(current)
    now = datetime.now(timezone.utc)
    if (
        (current.revoked_at is not None and permission != "execution.cancel")
        or _utc(current.expires_at) <= now
        or current.authority_bytes != authority_bytes
        or current.authority_digest != binding.authority_digest
        or authority.expires_at <= now
        or permission not in authority.permissions
        or authority.execution_id != execution_id
        or authority.publication_id != publication_id
        or authority.engine_job_id != engine_job_id
    ):
        raise AuthorityUnauthorized("authority_not_current")
    return binding


async def commit_authority(
    session: AsyncSession,
    authority_bytes: bytes,
    *,
    expected_capability_id: str | None,
) -> EngineAuthorityBinding:
    binding = parse_authority(authority_bytes)
    authority = binding.authority
    current = await _lock_authority(session, authority.execution_id)
    if current is None:
        if expected_capability_id is not None:
            raise AuthorityConflict("authority_predecessor_conflict")
        if (
            authority.engine_epoch != 1
            or authority.ownership_revision != 1
            or authority.expires_at <= datetime.now(timezone.utc)
        ):
            raise AuthorityConflict("authority_initial_revision_conflict")
        current = TrellisDeliveryAuthority(
            execution_id=authority.execution_id,
            authority_bytes=authority_bytes,
            authority_digest=binding.authority_digest,
            publication_id=authority.publication_id,
            engine_job_id=authority.engine_job_id,
            engine_epoch=authority.engine_epoch,
            host_id=authority.host_id,
            owner_id=authority.owner_id,
            ownership_revision=authority.ownership_revision,
            capability_id=authority.capability_id,
            expires_at=authority.expires_at,
            revoked_at=None,
        )
        session.add(current)
        await session.flush()
        return binding
    if current.authority_bytes == authority_bytes and current.revoked_at is None:
        _stored_binding(current)
        return binding
    previous = _stored_binding(current).authority
    renewal = authority.engine_epoch == current.engine_epoch and authority.owner_id == current.owner_id
    takeover = authority.engine_epoch == current.engine_epoch + 1 and authority.owner_id != current.owner_id
    if (
        authority.expires_at <= datetime.now(timezone.utc)
        or current.capability_id != expected_capability_id
        or current.publication_id != authority.publication_id
        or current.engine_job_id != authority.engine_job_id
        or current.host_id != authority.host_id
        or previous.project_id != authority.project_id
        or previous.publication_digest != authority.publication_digest
        or authority.ownership_revision != current.ownership_revision + 1
        or not (renewal or takeover)
        or (current.revoked_at is None and takeover)
        or (current.revoked_at is not None and renewal)
    ):
        raise AuthorityConflict("authority_transition_conflict")
    current.authority_bytes = authority_bytes
    current.authority_digest = binding.authority_digest
    current.engine_epoch = authority.engine_epoch
    current.owner_id = authority.owner_id
    current.ownership_revision = authority.ownership_revision
    current.capability_id = authority.capability_id
    current.expires_at = authority.expires_at
    current.revoked_at = None
    await session.flush()
    return binding


async def revoke_authority(
    session: AsyncSession,
    execution_id: str,
    *,
    expected_capability_id: str,
    revoked_at: datetime,
) -> None:
    if revoked_at.tzinfo is None:
        raise AuthorityConflict("authority_revocation_timezone_required")
    current = await _lock_authority(session, execution_id)
    if current is None or current.capability_id != expected_capability_id:
        raise AuthorityConflict("authority_revocation_conflict")
    if current.revoked_at is None:
        current.revoked_at = revoked_at
        await session.flush()
    elif _utc(current.revoked_at) != _utc(revoked_at):
        raise AuthorityConflict("authority_revocation_conflict")


async def read_authority(session: AsyncSession, execution_id: str) -> EngineAuthorityState | None:
    result = await session.execute(
        select(TrellisDeliveryAuthority).where(TrellisDeliveryAuthority.execution_id == execution_id)
    )
    current = result.scalar_one_or_none()
    if current is None:
        return None
    return EngineAuthorityState(binding=_stored_binding(current), revoked_at=current.revoked_at)
