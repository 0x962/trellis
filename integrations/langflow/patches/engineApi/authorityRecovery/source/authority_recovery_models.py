from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from pydantic import AnyHttpUrl, AwareDatetime, BaseModel, ConfigDict, Field

from langflow.services.trellis_v1.authority import EngineAuthorityBinding

REFERENCE_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"
DIGEST_PATTERN = r"^[0-9a-f]{64}$"


class RecoveryInvalid(RuntimeError):
    pass


class RecoveryConflict(RuntimeError):
    pass


class RecoveryMissing(RuntimeError):
    pass


class RecoveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    version: Literal[1]
    request_id: UUID = Field(alias="requestId")
    original_authority_bytes: str = Field(alias="originalAuthorityBytes", min_length=1)
    initial_record_bytes: str = Field(alias="initialRecordBytes", min_length=1)
    successor_commit_bytes: str = Field(alias="successorCommitBytes", min_length=1)


class SidecarIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    data_home_id: str = Field(alias="dataHomeId", pattern=REFERENCE_PATTERN)
    host_id: str = Field(alias="hostId", pattern=REFERENCE_PATTERN)
    owner_id: str = Field(alias="ownerId", pattern=REFERENCE_PATTERN)
    instance_id: str = Field(alias="instanceId", pattern=REFERENCE_PATTERN)
    manifest_digest: str = Field(alias="manifestDigest", pattern=DIGEST_PATTERN)


class LiveObservation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str = Field(pattern=REFERENCE_PATTERN)
    observed_at: AwareDatetime = Field(alias="observedAt")
    endpoint: AnyHttpUrl
    identity: SidecarIdentity


class CorrelationReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    version: Literal[1]
    host_id: str = Field(alias="hostId", pattern=REFERENCE_PATTERN)
    execution_id: str = Field(alias="executionId", pattern=REFERENCE_PATTERN)
    publication_id: str = Field(alias="publicationId", pattern=REFERENCE_PATTERN)
    submission_digest: str = Field(alias="submissionDigest", pattern=DIGEST_PATTERN)
    engine_job_id: UUID = Field(alias="engineJobId")
    engine_session_id: str = Field(alias="engineSessionId", pattern=REFERENCE_PATTERN)
    recorded_at: AwareDatetime = Field(alias="recordedAt")


class EffectBinding(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    effect_id: str = Field(alias="effectId", pattern=REFERENCE_PATTERN)
    kind: Literal["admission", "recovery"]
    execution_id: str = Field(alias="executionId", pattern=REFERENCE_PATTERN)
    attempt_id: str | None = Field(alias="attemptId")
    job_id: str | None = Field(alias="jobId")
    request_id: str = Field(alias="requestId", pattern=REFERENCE_PATTERN)
    payload_digest: str = Field(alias="payloadDigest", pattern=DIGEST_PATTERN)


class DispatchPermit(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: UUID
    data_home_id: str = Field(alias="dataHomeId", pattern=REFERENCE_PATTERN)
    generation: int = Field(ge=0)
    binding: EffectBinding


class InitialAuthorityInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    execution_id: str = Field(alias="executionId", pattern=REFERENCE_PATTERN)
    host_id: str = Field(alias="hostId", pattern=REFERENCE_PATTERN)
    project_id: str = Field(alias="projectId", pattern=REFERENCE_PATTERN)
    publication_id: str = Field(alias="publicationId", pattern=REFERENCE_PATTERN)
    publication_digest: str = Field(alias="publicationDigest", pattern=DIGEST_PATTERN)
    submission_digest: str = Field(alias="submissionDigest", pattern=DIGEST_PATTERN)
    correlation: CorrelationReceipt
    expires_at: AwareDatetime = Field(alias="expiresAt")
    permissions: tuple[str, ...] = Field(min_length=1)
    permit: DispatchPermit


class InitialAuthorityRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    version: Literal[1]
    issuance_receipt_id: UUID = Field(alias="issuanceReceiptId")
    input: InitialAuthorityInput
    observation: LiveObservation
    authority_bytes: str = Field(alias="authorityBytes", min_length=1)


class OwnerRevocation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str = Field(pattern=REFERENCE_PATTERN)
    identity: SidecarIdentity
    observation_id: str = Field(alias="observationId", pattern=REFERENCE_PATTERN)


class TakeoverStops(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    source_bytes: str = Field(alias="sourceBytes", min_length=1)
    source_digest: str = Field(alias="sourceDigest", pattern=DIGEST_PATTERN)


class SuccessorCommit(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    initial_record_bytes: str | None = Field(default=None, alias="initialRecordBytes")
    takeover_stops: TakeoverStops | None = Field(default=None, alias="takeoverStops")
    permit: DispatchPermit
    request_bytes: str = Field(alias="requestBytes", min_length=1)
    authority_bytes: str = Field(alias="authorityBytes", min_length=1)
    receipt: dict[str, Any]
    observation: LiveObservation
    revocation: OwnerRevocation | None


@dataclass(frozen=True)
class RecoveryEnvelope:
    request: RecoveryRequest
    initial: InitialAuthorityRecord
    original: EngineAuthorityBinding
    successor: SuccessorCommit
    successor_authority: EngineAuthorityBinding
    takeover: bool


def digest(source: bytes | str) -> str:
    value = source.encode() if isinstance(source, str) else source
    return hashlib.sha256(value).hexdigest()
