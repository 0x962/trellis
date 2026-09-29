from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from langflow.services.trellis_v1.authority import AuthorityUnauthorized, EngineAuthorityBinding, parse_authority
from langflow.services.trellis_v1.authority_recovery_models import (
    InitialAuthorityRecord,
    RecoveryConflict,
    RecoveryEnvelope,
    RecoveryInvalid,
    RecoveryRequest,
    SuccessorCommit,
    digest,
)


def _json(source: str, name: str) -> dict[str, Any]:
    try:
        value = json.loads(source)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RecoveryInvalid(f"{name}_invalid") from error
    if not isinstance(value, dict):
        raise RecoveryInvalid(f"{name}_invalid")
    return value


def _keys(value: dict[str, Any], expected: set[str], name: str) -> None:
    if set(value) != expected:
        raise RecoveryInvalid(f"{name}_invalid")


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise RecoveryInvalid("authority_timestamp_timezone_required")
    return value.astimezone(timezone.utc)


def _timestamp(value: object, name: str) -> datetime:
    if not isinstance(value, str):
        raise RecoveryInvalid(f"{name}_invalid")
    try:
        return _utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError as error:
        raise RecoveryInvalid(f"{name}_invalid") from error


def _validate_original(initial: InitialAuthorityRecord, binding: EngineAuthorityBinding) -> None:
    authority = binding.authority
    input = initial.input
    observation = initial.observation
    correlation = input.correlation
    if (
        authority.execution_id != input.execution_id
        or authority.host_id != input.host_id
        or authority.project_id != input.project_id
        or authority.publication_id != input.publication_id
        or authority.publication_digest != input.publication_digest
        or authority.engine_job_id != correlation.engine_job_id
        or authority.engine_epoch != 1
        or authority.ownership_revision != 1
        or authority.owner_id != observation.identity.owner_id
        or authority.host_id != observation.identity.host_id
        or _utc(authority.issued_at) != _utc(observation.observed_at)
        or _utc(authority.expires_at) != _utc(input.expires_at)
        or authority.permissions != input.permissions
        or correlation.execution_id != input.execution_id
        or correlation.host_id != input.host_id
        or correlation.publication_id != input.publication_id
        or correlation.submission_digest != input.submission_digest
        or input.permit.data_home_id != observation.identity.data_home_id
        or input.permit.binding.execution_id != input.execution_id
        or (input.permit.binding.job_id is not None and input.permit.binding.job_id != str(correlation.engine_job_id))
    ):
        raise RecoveryConflict("initial_recovery_identity_conflict")


def _validate_successor(envelope: RecoveryEnvelope, now: datetime) -> None:
    request = envelope.request
    initial = envelope.initial
    original = envelope.original.authority
    commit = envelope.successor
    successor = envelope.successor_authority.authority
    receipt = commit.receipt
    authority_value = _json(commit.authority_bytes, "successor_authority")
    commit_request = _json(commit.request_bytes, "successor_request")
    if receipt.get("authority") != authority_value or receipt.get("request") != commit_request:
        raise RecoveryConflict("successor_commit_bytes_conflict")
    if receipt.get("requestDigest") != digest(commit.request_bytes):
        raise RecoveryConflict("successor_request_digest_conflict")
    if commit.initial_record_bytes is not None and commit.initial_record_bytes != request.initial_record_bytes:
        raise RecoveryConflict("initial_record_bytes_conflict")
    if (
        receipt.get("version") != 1
        or commit_request.get("version") != 1
        or successor.execution_id != original.execution_id
        or successor.publication_id != original.publication_id
        or successor.engine_job_id != original.engine_job_id
        or successor.host_id != original.host_id
        or successor.project_id != original.project_id
        or successor.publication_digest != original.publication_digest
        or successor.ownership_revision != original.ownership_revision + 1
        or _utc(successor.issued_at) != _utc(commit.observation.observed_at)
        or _utc(successor.expires_at) <= now
        or commit.permit.data_home_id != initial.observation.identity.data_home_id
        or commit.permit.binding.execution_id != original.execution_id
        or (commit.permit.binding.job_id is not None and commit.permit.binding.job_id != str(original.engine_job_id))
    ):
        raise RecoveryConflict("successor_authority_transition_conflict")
    if (
        commit_request.get("requestId") != str(request.request_id)
        or commit_request.get("executionId") != original.execution_id
    ):
        raise RecoveryConflict("successor_request_identity_conflict")
    _validate_permit(envelope, commit_request)
    if envelope.takeover:
        _validate_takeover(envelope, commit_request)
    else:
        _validate_renewal(envelope, commit_request, now)


def _validate_permit(envelope: RecoveryEnvelope, request: dict[str, Any]) -> None:
    authority = envelope.successor_authority.authority
    permit = envelope.successor.permit
    operation = "takeover" if envelope.takeover else "renewal"
    intent = {
        "operation": operation,
        "executionId": authority.execution_id,
        "requestId": str(envelope.request.request_id),
        "expectedRevision": envelope.original.authority.ownership_revision,
        "expiresAt": envelope.successor.receipt["authority"].get("expiresAt"),
    }
    if envelope.takeover:
        intent["expectedOwnerId"] = envelope.original.authority.owner_id
        intent["expectedEpoch"] = envelope.original.authority.engine_epoch
    binding = permit.binding
    if (
        binding.effect_id != f"authority:{authority.execution_id}:{envelope.request.request_id}"
        or binding.kind != "recovery"
        or binding.execution_id != authority.execution_id
        or binding.attempt_id is not None
        or binding.job_id != str(authority.engine_job_id)
        or binding.request_id != str(envelope.request.request_id)
        or binding.payload_digest != digest(json.dumps(intent, separators=(",", ":")))
        or request.get("expectedRevision") != envelope.original.authority.ownership_revision
    ):
        raise RecoveryConflict("successor_permit_conflict")


def _validate_takeover(envelope: RecoveryEnvelope, request: dict[str, Any]) -> None:
    receipt = envelope.successor.receipt
    _keys(
        receipt,
        {"version", "request", "requestDigest", "transferId", "committedAt", "authority", "admission"},
        "takeover_receipt",
    )
    _keys(
        request,
        {
            "version", "executionId", "requestId", "expectedOwnerId", "expectedEpoch",
            "expectedRevision", "newOwnerId", "supervisorObservationId", "priorOwnerRevocationId",
        },
        "takeover_request",
    )
    initial = envelope.initial
    original = envelope.original.authority
    commit = envelope.successor
    successor = envelope.successor_authority.authority
    revocation = commit.revocation
    admission = receipt["admission"]
    if not isinstance(admission, dict):
        raise RecoveryInvalid("takeover_admission_invalid")
    _keys(admission, {"state", "barrierId"}, "takeover_admission")
    if (
        revocation is None
        or commit.takeover_stops is None
        or digest(commit.takeover_stops.source_bytes) != commit.takeover_stops.source_digest
        or successor.owner_id == original.owner_id
        or successor.owner_id != commit.observation.identity.owner_id
        or successor.engine_epoch != original.engine_epoch + 1
        or request.get("expectedOwnerId") != original.owner_id
        or request.get("expectedEpoch") != original.engine_epoch
        or request.get("expectedRevision") != original.ownership_revision
        or request.get("newOwnerId") != successor.owner_id
        or request.get("supervisorObservationId") != commit.observation.id
        or request.get("priorOwnerRevocationId") != revocation.id
        or revocation.identity != initial.observation.identity
        or revocation.observation_id != initial.observation.id
        or _timestamp(receipt.get("committedAt"), "takeover_committed_at") != _utc(commit.observation.observed_at)
        or admission.get("state") != "closed"
    ):
        raise RecoveryConflict("successor_takeover_conflict")


def _validate_renewal(envelope: RecoveryEnvelope, request: dict[str, Any], now: datetime) -> None:
    receipt = envelope.successor.receipt
    _keys(receipt, {"version", "request", "requestDigest", "renewalId", "authority"}, "renewal_receipt")
    _keys(
        request,
        {
            "version",
            "requestId",
            "executionId",
            "ownerId",
            "engineEpoch",
            "expectedRevision",
            "supervisorObservationId",
        },
        "renewal_request",
    )
    initial = envelope.initial
    original = envelope.original.authority
    commit = envelope.successor
    successor = envelope.successor_authority.authority
    if (
        _utc(original.expires_at) > now
        or commit.revocation is not None
        or commit.takeover_stops is not None
        or commit.observation.identity != initial.observation.identity
        or successor.owner_id != original.owner_id
        or successor.engine_epoch != original.engine_epoch
        or request.get("ownerId") != original.owner_id
        or request.get("engineEpoch") != original.engine_epoch
        or request.get("expectedRevision") != original.ownership_revision
        or request.get("supervisorObservationId") != commit.observation.id
    ):
        raise RecoveryConflict("successor_renewal_conflict")


def parse_recovery_envelope(request: RecoveryRequest, now: datetime) -> RecoveryEnvelope:
    try:
        initial = InitialAuthorityRecord.model_validate_json(request.initial_record_bytes, strict=True)
        successor = SuccessorCommit.model_validate_json(request.successor_commit_bytes, strict=True)
        original = parse_authority(request.original_authority_bytes.encode())
        successor_authority = parse_authority(successor.authority_bytes.encode())
    except (AuthorityUnauthorized, ValueError, TypeError) as error:
        raise RecoveryInvalid("initial_recovery_request_invalid") from error
    if initial.authority_bytes != request.original_authority_bytes:
        raise RecoveryConflict("original_authority_bytes_conflict")
    _validate_original(initial, original)
    envelope = RecoveryEnvelope(
        request=request,
        initial=initial,
        original=original,
        successor=successor,
        successor_authority=successor_authority,
        takeover="transferId" in successor.receipt,
    )
    _validate_successor(envelope, now)
    return envelope
