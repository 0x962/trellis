from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import Column, LargeBinary, Text, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Field, SQLModel

from langflow.services.database.models.jobs.model import Job, JobType
from langflow.services.trellis_v1.authority import TrellisDeliveryAuthority
from langflow.services.trellis_v1.authority_recovery_models import (
    CorrelationReceipt,
    RecoveryConflict,
    RecoveryEnvelope,
    RecoveryMissing,
    RecoveryRequest,
    SidecarIdentity,
    digest,
)
from langflow.services.trellis_v1.authority_recovery_validation import parse_recovery_envelope
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.engine_api import EngineApiIdentity


class TrellisAuthorityRecovery(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "trellis_authority_recoveries"

    request_id: UUID = Field(primary_key=True)
    execution_id: str = Field(sa_column=Column(Text, nullable=False, unique=True))
    engine_job_id: UUID = Field(unique=True)
    request_bytes: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    request_digest: str = Field(sa_column=Column(Text, nullable=False))
    original_authority_bytes: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    original_authority_digest: str = Field(sa_column=Column(Text, nullable=False))
    initial_record_bytes: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    successor_commit_bytes: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    successor_authority_bytes: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    successor_authority_digest: str = Field(sa_column=Column(Text, nullable=False))
    response_bytes: bytes = Field(sa_column=Column(LargeBinary, nullable=False))


def _sidecar(identity: EngineApiIdentity) -> SidecarIdentity:
    return SidecarIdentity(
        dataHomeId=identity.data_home_id,
        hostId=identity.host_id,
        ownerId=identity.owner_id,
        instanceId=str(identity.instance_id),
        manifestDigest=identity.manifest_digest,
    )


async def _lock_job(session: AsyncSession, job_id: UUID) -> Job:
    result = await session.execute(select(Job).where(Job.job_id == job_id).with_for_update())
    job = result.scalar_one_or_none()
    if job is None or job.type != JobType.WORKFLOW:
        raise RecoveryMissing("initial_recovery_job_not_found")
    return job


async def _lock_authority(session: AsyncSession, execution_id: str) -> TrellisDeliveryAuthority | None:
    result = await session.execute(
        select(TrellisDeliveryAuthority)
        .where(TrellisDeliveryAuthority.execution_id == execution_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def _lock_recovery(session: AsyncSession, request_id: UUID) -> TrellisAuthorityRecovery | None:
    result = await session.execute(
        select(TrellisAuthorityRecovery)
        .where(TrellisAuthorityRecovery.request_id == request_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


def _validate_runtime(envelope: RecoveryEnvelope, identity: EngineApiIdentity) -> None:
    initial_identity = envelope.initial.observation.identity
    successor_identity = envelope.successor.observation.identity
    current_identity = _sidecar(identity)
    original = envelope.original.authority
    if (
        successor_identity != current_identity
        or initial_identity.data_home_id != current_identity.data_home_id
        or initial_identity.host_id != current_identity.host_id
        or original.host_id != current_identity.host_id
    ):
        raise RecoveryConflict("initial_recovery_runtime_identity_conflict")


async def _validate_correlation(session: AsyncSession, envelope: RecoveryEnvelope) -> None:
    original = envelope.original.authority
    result = await session.execute(
        select(TrellisJobCorrelation)
        .where(TrellisJobCorrelation.engine_job_id == original.engine_job_id)
        .with_for_update()
    )
    correlation = result.scalar_one_or_none()
    if correlation is None:
        raise RecoveryMissing("initial_recovery_correlation_not_found")
    try:
        stored_receipt = CorrelationReceipt.model_validate_json(
            correlation.correlation_receipt_bytes,
            strict=True,
        )
    except ValueError as error:
        raise RecoveryConflict("stored_correlation_invalid") from error
    expected = envelope.initial.input.correlation
    if (
        correlation.execution_id != original.execution_id
        or correlation.host_id != original.host_id
        or correlation.engine_job_id != original.engine_job_id
        or correlation.engine_session_id != expected.engine_session_id
        or correlation.submission_bytes_digest != expected.submission_digest
        or stored_receipt != expected
        or correlation.admission_receipt_bytes is not None
    ):
        raise RecoveryConflict("initial_recovery_correlation_conflict")
    if envelope.takeover and envelope.successor.receipt["admission"].get("barrierId") != correlation.barrier_id:
        raise RecoveryConflict("initial_recovery_admission_conflict")


def _response(envelope: RecoveryEnvelope, request_bytes: bytes) -> bytes:
    value = {
        "version": 1,
        "requestId": str(envelope.request.request_id),
        "requestDigest": digest(request_bytes),
        "originalAuthorityDigest": envelope.original.authority_digest,
        "successorAuthorityDigest": envelope.successor_authority.authority_digest,
        "successorCommitDigest": digest(envelope.request.successor_commit_bytes),
        "state": "committed",
    }
    return json.dumps(value, separators=(",", ":")).encode()


async def recover_initial_authority(
    session: AsyncSession,
    *,
    request: RecoveryRequest,
    request_bytes: bytes,
    identity: EngineApiIdentity,
) -> bytes:
    saved_hint = (
        await session.execute(
            select(TrellisAuthorityRecovery).where(TrellisAuthorityRecovery.request_id == request.request_id)
        )
    ).scalar_one_or_none()
    if saved_hint is not None:
        if saved_hint.request_bytes != request_bytes:
            raise RecoveryConflict("initial_recovery_request_replay_conflict")
        return saved_hint.response_bytes
    envelope = parse_recovery_envelope(request, datetime.now(timezone.utc))
    job_id = envelope.original.authority.engine_job_id
    execution_id = envelope.original.authority.execution_id
    await _lock_job(session, job_id)
    current = await _lock_authority(session, execution_id)
    saved = await _lock_recovery(session, request.request_id)
    if saved is not None:
        if saved.request_bytes != request_bytes:
            raise RecoveryConflict("initial_recovery_request_replay_conflict")
        return saved.response_bytes
    if current is not None:
        raise RecoveryConflict("initial_recovery_authority_already_present")
    prior = (
        await session.execute(
            select(TrellisAuthorityRecovery)
            .where(TrellisAuthorityRecovery.execution_id == execution_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if prior is not None:
        raise RecoveryConflict("initial_recovery_execution_conflict")
    _validate_runtime(envelope, identity)
    await _validate_correlation(session, envelope)
    authority = envelope.successor_authority.authority
    session.add(TrellisDeliveryAuthority(
        execution_id=authority.execution_id,
        authority_bytes=envelope.successor_authority.authority_bytes,
        authority_digest=envelope.successor_authority.authority_digest,
        publication_id=authority.publication_id,
        engine_job_id=authority.engine_job_id,
        engine_epoch=authority.engine_epoch,
        host_id=authority.host_id,
        owner_id=authority.owner_id,
        ownership_revision=authority.ownership_revision,
        capability_id=authority.capability_id,
        expires_at=authority.expires_at,
        revoked_at=None,
    ))
    response_bytes = _response(envelope, request_bytes)
    session.add(TrellisAuthorityRecovery(
        request_id=request.request_id,
        execution_id=execution_id,
        engine_job_id=job_id,
        request_bytes=request_bytes,
        request_digest=digest(request_bytes),
        original_authority_bytes=envelope.original.authority_bytes,
        original_authority_digest=envelope.original.authority_digest,
        initial_record_bytes=request.initial_record_bytes.encode(),
        successor_commit_bytes=request.successor_commit_bytes.encode(),
        successor_authority_bytes=envelope.successor_authority.authority_bytes,
        successor_authority_digest=envelope.successor_authority.authority_digest,
        response_bytes=response_bytes,
    ))
    await session.flush()
    return response_bytes
