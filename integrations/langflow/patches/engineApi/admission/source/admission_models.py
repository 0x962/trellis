from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Reference = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class EngineKey(StrictModel):
    version: Literal[1]
    hostId: Reference
    executionId: Reference

    @field_validator("version", mode="before")
    @classmethod
    def exact_version_type(cls, value):
        if type(value) is not int:
            raise ValueError("invalid_version_type")
        return value


class SubmitRequest(StrictModel):
    envelopeBytes: str
    payloadBytes: str


class SubmissionPayload(StrictModel):
    publication: dict
    snapshot: dict


class OpenRequest(StrictModel):
    receiptBytes: str
    authorityBytes: str


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
