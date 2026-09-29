from __future__ import annotations

import hashlib
import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Reference = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")]
Digest = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
Uuid = Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
Revision = Annotated[int, Field(gt=0)]


class NativeConflict(ValueError):
    """The supplied native identity or bytes conflict with a retained record."""


class ProtocolModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class LaunchBinding(ProtocolModel):
    executionId: Reference
    publicationId: Reference
    engineJobId: Uuid
    engineEpoch: Revision


class DeliveryAuthority(LaunchBinding):
    version: Literal[1]
    hostId: Reference
    projectId: Reference
    publicationDigest: Digest
    ownerId: Reference
    ownershipRevision: Revision
    capabilityId: Reference
    permissions: list[Literal["native.reserve", "native.read", "completion.deliver", "decision.deliver", "events.append"]] = Field(min_length=1)
    issuedAt: str
    expiresAt: str


class ArtifactReference(ProtocolModel):
    artifactId: Reference
    contentHash: Digest


class NativeResult(ProtocolModel):
    version: Literal[1]
    launchBinding: LaunchBinding
    requestDigest: Digest
    completionId: Reference
    stepId: Reference
    agentRunId: Reference
    attemptId: Uuid
    providerSessionId: Reference
    promptReceiptId: Reference
    resultId: Reference
    resultVersion: Revision
    output: str
    outputHash: Digest
    artifactRefs: list[ArtifactReference]
    exitKind: Literal["completed", "process_error", "timeout", "canceled"]


class CompletionInput(ProtocolModel):
    engineWaitId: Reference
    resultBytes: str
    deliveryBytes: str
    authorityBytes: str


class LookupInput(ProtocolModel):
    jobId: Uuid
    waitId: Reference
    authorityBytes: str


class InputReceiptsInput(ProtocolModel):
    requestBytes: str
    authorityBytes: str


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise NativeConflict("duplicate_json_field")
        result[key] = value
    return result


def read_json(value: str) -> dict[str, Any]:
    parsed = json.loads(value, object_pairs_hook=_object)
    if not isinstance(parsed, dict):
        raise NativeConflict("native_object_required")
    return parsed


def serialized(value: object) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def validate_completion(payload: CompletionInput, wait: dict, request_bytes: str, authority: dict) -> dict:
    result = read_json(payload.resultBytes)
    NativeResult.model_validate(result)
    delivery = read_json(payload.deliveryBytes)
    if set(delivery) != {"version", "result", "resultDigest", "authority"} or type(delivery["version"]) is not int or delivery["version"] != 1:
        raise NativeConflict("native_delivery_fields")
    if delivery["result"] != result or delivery["resultDigest"] != digest(payload.resultBytes):
        raise NativeConflict("native_result_digest_conflict")
    if result["outputHash"] != digest(result["output"]):
        raise NativeConflict("native_output_digest_conflict")
    DeliveryAuthority.model_validate(delivery["authority"])
    if delivery["authority"] != authority or "completion.deliver" not in authority["permissions"]:
        raise NativeConflict("native_delivery_authority_conflict")
    if wait["kind"] != "native" or wait["waitId"] != payload.engineWaitId:
        raise NativeConflict("native_wait_conflict")
    request, handle = wait["request"], wait["handle"]
    if read_json(request_bytes) != request or result["requestDigest"] != digest(request_bytes):
        raise NativeConflict("native_request_digest_conflict")
    if any(result["launchBinding"][field] != request[field] for field in ("executionId", "publicationId", "engineJobId", "engineEpoch")):
        raise NativeConflict("native_launch_binding_conflict")
    if any(authority[field] != request[field] for field in ("executionId", "publicationId", "engineJobId")) or authority["engineEpoch"] < request["engineEpoch"]:
        raise NativeConflict("native_authority_binding_conflict")
    if any(result[field] != handle[field] for field in ("stepId", "agentRunId", "attemptId")):
        raise NativeConflict("native_attempt_conflict")
    if result["promptReceiptId"] != handle["attemptId"]:
        raise NativeConflict("native_prompt_receipt_conflict")
    if handle["providerSessionId"] is not None and result["providerSessionId"] != handle["providerSessionId"]:
        raise NativeConflict("native_provider_session_conflict")
    return result
