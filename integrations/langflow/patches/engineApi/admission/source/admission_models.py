from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from langflow.services.trellis_v1.correlation import _timestamp, _uuid

Reference = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Revision = Annotated[int, Field(gt=0)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class EngineKey(StrictModel):
    version: Literal[1]
    hostId: Reference
    executionId: Reference


class SubmitRequest(StrictModel):
    envelopeBytes: str
    payloadBytes: str


class SubmissionPayload(StrictModel):
    publication: dict
    snapshot: dict


class DeliveryAuthority(StrictModel):
    version: Literal[1]
    executionId: Reference
    publicationId: Reference
    engineJobId: str
    engineEpoch: Revision
    hostId: Reference
    projectId: Reference
    publicationDigest: Digest
    ownerId: Reference
    ownershipRevision: Revision
    capabilityId: Reference
    permissions: list[Literal[
        "native.reserve", "native.read", "completion.deliver", "decision.deliver", "events.append"
    ]] = Field(min_length=1)
    issuedAt: str
    expiresAt: str

    @model_validator(mode="after")
    def valid_identity(self):
        _uuid(self.engineJobId, "engineJobId")
        _timestamp(self.issuedAt, "issuedAt")
        _timestamp(self.expiresAt, "expiresAt")
        if datetime.fromisoformat(self.expiresAt) <= datetime.fromisoformat(self.issuedAt):
            raise ValueError("authority_expiry_order")
        return self


class OpenRequest(StrictModel):
    receiptBytes: str
    authority: DeliveryAuthority


class Found(StrictModel):
    state: Literal["found"] = "found"
    receiptBytes: str


class Absent(StrictModel):
    state: Literal["absent"] = "absent"
    key: EngineKey
    authoritative: Literal[True] = True


class Unknown(StrictModel):
    state: Literal["unknown"] = "unknown"
    key: EngineKey


class Admitted(StrictModel):
    state: Literal["admitted"] = "admitted"
    receiptBytes: str


class Pending(StrictModel):
    state: Literal["pending"] = "pending"


class AdmissionUnknown(StrictModel):
    state: Literal["unknown"] = "unknown"
