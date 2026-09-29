from __future__ import annotations

import hashlib
import json
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, model_validator

from langflow.services.trellis_v1.capture_grants import CaptureIdentity, Digest, StrictUUID, Text


class ReconciliationConflict(ValueError):
    pass


class ReconciliationMissing(LookupError):
    pass


class ReconciliationModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ReconciliationBlock(ReconciliationModel):
    id: StrictUUID
    dataHomeId: StrictUUID
    generation: StrictInt = Field(gt=0, le=9007199254740991)
    requestId: Text


class ReconciliationLease(ReconciliationModel):
    version: Literal[1]
    id: StrictUUID
    block: ReconciliationBlock
    identity: CaptureIdentity
    issuerDigest: Digest

    @model_validator(mode="after")
    def match_scope(self):
        if self.block.dataHomeId != self.identity.dataHomeId:
            raise ValueError("reconciliation_lease_scope_conflict")
        return self


class ReconciliationAcknowledgement(ReconciliationModel):
    version: Literal[1]
    leaseId: StrictUUID
    blockId: StrictUUID
    dataHomeId: StrictUUID
    generation: StrictInt = Field(gt=0, le=9007199254740991)
    reconciliationReceiptId: Text


class PackageIdentity(ReconciliationModel):
    enginePackageDigest: Digest
    componentManifestHash: Digest
    engineCommit: StrictStr = Field(pattern=r"^[0-9a-f]{40}$")
    engineConfigSha256: Digest


class DatabaseIdentity(ReconciliationModel):
    path: Text
    contentSha256: Digest
    size: StrictInt = Field(ge=0)
    alembicHeads: tuple[Text, ...]


class SecretIdentity(ReconciliationModel):
    sha256: Digest


class LiveEngineIdentity(ReconciliationModel):
    runtime: CaptureIdentity
    package: PackageIdentity
    database: DatabaseIdentity
    secret: SecretIdentity


class ReconciliationRecord(ReconciliationModel):
    leaseBytes: StrictStr
    leaseDigest: Digest
    state: Literal["active", "released"]
    identity: LiveEngineIdentity
    identityBytes: StrictStr
    identityDigest: Digest
    acknowledgementBytes: StrictStr | None
    receiptId: Digest


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("reconciliation_duplicate_key")
        result[key] = value
    return result


def _parse_exact(content: str, model):
    value = json.loads(content, object_pairs_hook=unique_keys)
    content.encode("utf-8")
    return model.model_validate(value)


def parse_lease(lease_bytes: str) -> ReconciliationLease:
    return _parse_exact(lease_bytes, ReconciliationLease)


def parse_acknowledgement(acknowledgement_bytes: str) -> ReconciliationAcknowledgement:
    return _parse_exact(acknowledgement_bytes, ReconciliationAcknowledgement)


def digest(content: str | bytes) -> str:
    encoded = content.encode("utf-8") if isinstance(content, str) else content
    return hashlib.sha256(encoded).hexdigest()


def record_receipt(
    lease_bytes: str,
    state: Literal["active", "released"],
    identity_bytes: str,
    acknowledgement_bytes: str | None,
) -> str:
    content = json.dumps(
        {
            "leaseBytes": lease_bytes,
            "state": state,
            "identityBytes": identity_bytes,
            "acknowledgementBytes": acknowledgement_bytes,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return digest(content)
