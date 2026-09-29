from __future__ import annotations

import hashlib
import json
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StrictInt, StrictStr, model_validator


class CaptureConflict(ValueError):
    pass


class CaptureMissing(LookupError):
    pass


Text = Annotated[StrictStr, Field(min_length=1)]
Digest = Annotated[StrictStr, Field(pattern=r"^[0-9a-f]{64}$")]
Generation = Annotated[StrictInt, Field(gt=0, le=9007199254740991)]


def canonical_uuid(value):
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str) or str(UUID(value)) != value.lower():
        raise ValueError("capture_uuid_invalid")
    return value


StrictUUID = Annotated[UUID, BeforeValidator(canonical_uuid)]


class CaptureModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CaptureIdentity(CaptureModel):
    dataHomeId: StrictUUID
    hostId: StrictUUID
    ownerId: StrictUUID
    instanceId: StrictUUID
    manifestDigest: Digest


class CaptureReason(CaptureModel):
    kind: Literal["capture"]
    snapshotId: Text


class CaptureBlock(CaptureModel):
    id: StrictUUID
    dataHomeId: StrictUUID
    generation: Generation
    requestId: Text
    reason: CaptureReason


class CaptureGrant(CaptureModel):
    version: Literal[1]
    id: StrictUUID
    block: CaptureBlock
    identity: CaptureIdentity
    snapshotId: Text
    boundaryReceiptId: Text

    @model_validator(mode="after")
    def match_scope(self):
        if self.block.dataHomeId != self.identity.dataHomeId or self.block.reason.snapshotId != self.snapshotId:
            raise ValueError("capture_grant_scope_conflict")
        return self


class CaptureReceipt(CaptureModel):
    grantBytes: StrictStr
    state: Literal["active", "revoked"]
    receiptId: Digest


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("capture_grant_duplicate_key")
        result[key] = value
    return result


def parse_grant(grant_bytes: str) -> CaptureGrant:
    value = json.loads(grant_bytes, object_pairs_hook=unique_keys)
    if not isinstance(value, dict) or type(value.get("version")) is not int:
        raise ValueError("capture_grant_version_invalid")
    grant = CaptureGrant.model_validate(value)
    grant_bytes.encode("utf-8")
    return grant


def capture_receipt(grant_bytes: str, state: Literal["active", "revoked"]) -> CaptureReceipt:
    content = json.dumps({"grantBytes": grant_bytes, "state": state}, ensure_ascii=False, separators=(",", ":"))
    return CaptureReceipt(grantBytes=grant_bytes, state=state,
                          receiptId=hashlib.sha256(content.encode("utf-8")).hexdigest())
