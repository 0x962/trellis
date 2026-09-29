from __future__ import annotations

import hashlib
import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.types import StringConstraints

Reference = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")]
Digest = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
Uuid = Annotated[
    str,
    StringConstraints(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
]


class ReviewConflict(ValueError):
    """The supplied review identity or bytes conflict with a retained record."""


class ProtocolModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class LoopIteration(ProtocolModel):
    loopNodeId: Reference
    round: int = Field(gt=0)


class Occurrence(ProtocolModel):
    nodeId: Reference
    occurrenceKey: Reference
    parentOccurrenceKey: Reference | None
    phase: Literal["step", "children", "condition"]
    iterationPath: list[LoopIteration]


class ReviewClassificationVisit(ProtocolModel):
    version: Literal[1]
    executionId: Reference
    publicationId: Reference
    engineJobId: Uuid
    engineEpoch: int = Field(gt=0)
    nodeId: Reference
    occurrenceKey: Reference
    parentOccurrenceKey: Reference | None
    phase: Literal["step", "children", "condition"]
    iterationPath: list[LoopIteration]
    requestId: Uuid
    classificationRequestId: Uuid
    classificationRequestDigest: Digest
    diffId: Reference
    reviewedHead: Reference
    specHash: Digest


class ReviewWait(ProtocolModel):
    version: Literal[1]
    executionId: Reference
    publicationId: Reference
    engineJobId: Uuid
    engineEpoch: int = Field(gt=0)
    occurrence: Occurrence
    engineRequestId: Uuid
    actionKey: Reference
    reviewArea: Literal["frontend", "backend"]
    visit: ReviewClassificationVisit
    visitDigest: Digest
    deadlineRefs: list[Reference]

    @model_validator(mode="after")
    def validate_visit(self) -> ReviewWait:
        occurrence = self.occurrence
        visit = self.visit
        if (
            self.executionId != visit.executionId
            or self.publicationId != visit.publicationId
            or self.engineJobId != visit.engineJobId
            or self.engineEpoch != visit.engineEpoch
            or self.engineRequestId != visit.requestId
            or occurrence.nodeId != visit.nodeId
            or occurrence.occurrenceKey != visit.occurrenceKey
            or occurrence.parentOccurrenceKey != visit.parentOccurrenceKey
            or occurrence.phase != visit.phase
            or occurrence.iterationPath != visit.iterationPath
        ):
            raise ValueError("review_wait_visit_conflict")
        return self


class ReviewExternalWait(ProtocolModel):
    kind: Literal["review"]
    waitId: Reference
    request: ReviewWait


class ReviewRelevance(ProtocolModel):
    frontend: bool
    backend: bool


class ReviewClassificationResult(ProtocolModel):
    version: Literal[1]
    classificationRequestId: Uuid
    classificationRequestDigest: Digest
    classificationReceiptId: Reference
    state: Literal["claimed", "succeeded", "failed"]
    relevance: ReviewRelevance | None
    error: str | None

    @model_validator(mode="after")
    def validate_state(self) -> ReviewClassificationResult:
        if self.state == "succeeded":
            if self.relevance is None or self.error is not None:
                raise ValueError("review_result_state_conflict")
        elif self.state == "failed":
            if self.relevance is not None or not self.error:
                raise ValueError("review_result_state_conflict")
        elif self.relevance is not None or self.error is not None:
            raise ValueError("review_result_state_conflict")
        return self


class ReviewClassificationResponse(ProtocolModel):
    version: Literal[1]
    visit: ReviewClassificationVisit
    visitDigest: Digest
    result: ReviewClassificationResult

    @model_validator(mode="after")
    def validate_request(self) -> ReviewClassificationResponse:
        if (
            self.visit.classificationRequestId != self.result.classificationRequestId
            or self.visit.classificationRequestDigest != self.result.classificationRequestDigest
        ):
            raise ValueError("review_classification_request_conflict")
        return self


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


class DeliveryAuthority(ProtocolModel):
    version: Literal[1]
    executionId: Reference
    publicationId: Reference
    engineJobId: Uuid
    engineEpoch: int = Field(gt=0)
    hostId: Reference
    projectId: Reference
    publicationDigest: Digest
    ownerId: Reference
    ownershipRevision: int = Field(gt=0)
    capabilityId: Reference
    permissions: list[Permission] = Field(min_length=1)
    issuedAt: str
    expiresAt: str


class ReviewClassificationDelivery(ProtocolModel):
    version: Literal[1]
    wait: ReviewWait
    result: ReviewClassificationResponse
    resultDigest: Digest
    authority: DeliveryAuthority

    @model_validator(mode="after")
    def validate_binding(self) -> ReviewClassificationDelivery:
        wait = self.wait
        result = self.result
        authority = self.authority
        if result.result.state == "claimed":
            raise ValueError("review_result_not_terminal")
        if (
            result.visitDigest != wait.visitDigest
            or result.visit != wait.visit
            or authority.executionId != wait.executionId
            or authority.publicationId != wait.publicationId
            or authority.engineJobId != wait.engineJobId
            or authority.engineEpoch < wait.engineEpoch
            or "classification.deliver" not in authority.permissions
        ):
            raise ValueError("review_delivery_binding_conflict")
        return self


class ReviewDeliveryInput(ProtocolModel):
    engineWaitId: Reference
    resultBytes: bytes
    deliveryBytes: bytes
    authorityBytes: bytes


def _object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ReviewConflict("duplicate_json_field")
        result[key] = value
    return result


def _read(value: str) -> dict[str, Any]:
    parsed = json.loads(value, object_pairs_hook=_object)
    if not isinstance(parsed, dict):
        raise ReviewConflict("review_object_required")
    return parsed


def read_review_visit(value: str) -> ReviewClassificationVisit:
    return ReviewClassificationVisit.model_validate(_read(value))


def read_review_response(value: str) -> ReviewClassificationResponse:
    return ReviewClassificationResponse.model_validate(_read(value))


def read_review_wait(value: str) -> ReviewExternalWait:
    return ReviewExternalWait.model_validate(_read(value))


def read_review_delivery(value: str) -> ReviewClassificationDelivery:
    return ReviewClassificationDelivery.model_validate(_read(value))


def serialize_review_response(value: ReviewClassificationResponse) -> str:
    return value.model_dump_json()


def review_digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def review_json(value: object) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def validate_review_delivery(
    payload: ReviewDeliveryInput,
    wait_bytes: bytes,
    authority: dict[str, Any],
) -> tuple[ReviewExternalWait, ReviewClassificationResponse, ReviewClassificationDelivery]:
    wait = read_review_wait(wait_bytes.decode("utf-8"))
    response = read_review_response(payload.resultBytes.decode("utf-8"))
    delivery = read_review_delivery(payload.deliveryBytes.decode("utf-8"))
    supplied_authority = _read(payload.authorityBytes.decode("utf-8"))
    if wait.waitId != payload.engineWaitId or delivery.wait != wait.request:
        raise ReviewConflict("review_wait_conflict")
    if delivery.result != response or delivery.resultDigest != review_digest(payload.resultBytes):
        raise ReviewConflict("review_result_digest_conflict")
    if delivery.authority.model_dump(mode="json") != authority or supplied_authority != authority:
        raise ReviewConflict("review_delivery_authority_conflict")
    return wait, response, delivery
