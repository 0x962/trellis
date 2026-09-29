from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CancellationConflict(RuntimeError):
    pass


class CancellationMissing(RuntimeError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


class CancelActor(StrictModel):
    kind: Literal["human"]
    name: str = Field(min_length=1)

    def structlog_log_context(self) -> dict[str, object]:
        return {"actor_kind": self.kind}


class CancelIntent(StrictModel):
    version: Literal[1]
    execution_id: str = Field(alias="executionId", min_length=1)
    request_id: UUID = Field(alias="requestId")
    actor: CancelActor
    expected_revision: int = Field(alias="expectedRevision", ge=1)
    requested_at: datetime = Field(alias="requestedAt")

    def structlog_log_context(self) -> dict[str, object]:
        return {"execution_id": self.execution_id, "request_id": str(self.request_id)}

    @model_validator(mode="after")
    def validate_timestamp(self) -> CancelIntent:
        if self.requested_at.tzinfo is None:
            raise ValueError("cancellation_timestamp_timezone_required")
        return self


class CancellationInput(StrictModel):
    execution_id: str = Field(alias="executionId", min_length=1)
    publication_id: str = Field(alias="publicationId", min_length=1)
    engine_job_id: UUID = Field(alias="engineJobId")
    request_id: UUID = Field(alias="requestId")
    cancel_intent_bytes: str = Field(alias="cancelIntentBytes", min_length=1)
    authority_bytes: str = Field(alias="authorityBytes", min_length=1)

    def structlog_log_context(self) -> dict[str, object]:
        return {
            "execution_id": self.execution_id,
            "request_id": str(self.request_id),
            "engine_job_id": str(self.engine_job_id),
        }

    @model_validator(mode="after")
    def validate_intent(self) -> CancellationInput:
        intent = CancelIntent.model_validate_json(self.cancel_intent_bytes)
        if intent.execution_id != self.execution_id or intent.request_id != self.request_id:
            raise ValueError("cancellation_identity_conflict")
        return self

    def request_bytes(self) -> str:
        return self.model_dump_json(by_alias=True, exclude={"authority_bytes"})


class CancellationReceipt(StrictModel):
    version: Literal[1]
    receipt_id: UUID = Field(alias="receiptId")
    request_id: UUID = Field(alias="requestId")
    execution_id: str = Field(alias="executionId")
    engine_job_id: UUID = Field(alias="engineJobId")
    cancel_intent_digest: str = Field(alias="cancelIntentDigest")
    accepted_at: datetime = Field(alias="acceptedAt")

    def structlog_log_context(self) -> dict[str, object]:
        return {
            "execution_id": self.execution_id,
            "request_id": str(self.request_id),
            "engine_job_id": str(self.engine_job_id),
            "receipt_id": str(self.receipt_id),
        }


class CancellationRecord(StrictModel):
    request_bytes: str = Field(alias="requestBytes")
    receipt: CancellationReceipt

    def structlog_log_context(self) -> dict[str, object]:
        return self.receipt.structlog_log_context()
