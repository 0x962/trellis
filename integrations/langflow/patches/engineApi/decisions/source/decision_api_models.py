from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Reference = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")]
Digest = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


class ProtocolModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=False)


class DecisionLookupRequest(ProtocolModel):
    version: Literal[1]
    execution_id: Reference = Field(alias="executionId")
    engine_job_id: UUID = Field(alias="engineJobId")
    engine_request_id: Reference = Field(alias="engineRequestId")
    decision_id: Reference = Field(alias="decisionId")
    payload_digest: Digest = Field(alias="payloadDigest")


class DecisionAcceptance(DecisionLookupRequest):
    acceptance_id: Reference = Field(alias="acceptanceId")
    signal_id: Reference = Field(alias="signalId")
    enqueue_obligation_id: Reference = Field(alias="enqueueObligationId")
    accepted_at: datetime = Field(alias="acceptedAt")


class DecisionAccepted(ProtocolModel):
    state: Literal["accepted"]
    receipt: DecisionAcceptance


class DecisionAbsent(ProtocolModel):
    state: Literal["absent"]
    lookup: DecisionLookupRequest
    authoritative: Literal[True]


class DecisionUnknown(ProtocolModel):
    state: Literal["unknown"]
    lookup: DecisionLookupRequest


class DecisionConflict(ProtocolModel):
    state: Literal["conflict"]
    lookup: DecisionLookupRequest
    accepted_digest: Digest = Field(alias="acceptedDigest")


DecisionLookupResult = Annotated[
    DecisionAccepted | DecisionAbsent | DecisionUnknown | DecisionConflict,
    Field(discriminator="state"),
]


class DecisionAcceptRequest(ProtocolModel):
    decision_bytes: str = Field(alias="decisionBytes")
    payload_digest: Digest = Field(alias="payloadDigest")
    authority_bytes: str = Field(alias="authorityBytes")
