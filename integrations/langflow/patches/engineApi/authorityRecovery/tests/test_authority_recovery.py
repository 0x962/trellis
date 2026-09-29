from __future__ import annotations

import json
from datetime import timedelta

import pytest
from sqlalchemy import select

from langflow.services.trellis_v1.authority import read_authority, revoke_authority
from langflow.services.trellis_v1.authority_recovery_models import RecoveryConflict, RecoveryRequest
from langflow.services.trellis_v1.authority_recovery_store import (
    TrellisAuthorityRecovery,
    recover_initial_authority,
)
from langflow.services.trellis_v1.authority_recovery_validation import parse_recovery_envelope
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation

from conftest import JOB_ID, NOW, recovery_request


@pytest.mark.asyncio
async def test_takeover_retains_history_and_installs_only_the_successor(database):
    async with database.sessions() as session:
        response = await recover_initial_authority(
            session,
            request=database.request,
            request_bytes=database.request_bytes,
            identity=database.identity,
        )
        await session.commit()
    receipt = json.loads(response)
    assert receipt["state"] == "committed"
    async with database.sessions() as session:
        state = await read_authority(session, "execution-1")
        saved = (await session.execute(select(TrellisAuthorityRecovery))).scalar_one()
        correlation = (await session.execute(select(TrellisJobCorrelation))).scalar_one()
    assert state.binding.authority.owner_id == "owner-2"
    assert state.binding.engine_epoch == 2
    assert saved.original_authority_bytes == database.request.original_authority_bytes.encode()
    assert saved.initial_record_bytes == database.request.initial_record_bytes.encode()
    assert saved.successor_commit_bytes == database.request.successor_commit_bytes.encode()
    assert correlation.admission_receipt_bytes is None
    assert correlation.barrier_id == "barrier-1"


@pytest.mark.asyncio
async def test_exact_replay_returns_the_original_response_and_changed_bytes_conflict(database):
    async with database.sessions() as session:
        first = await recover_initial_authority(
            session, request=database.request, request_bytes=database.request_bytes, identity=database.identity,
        )
        await session.commit()
    async with database.sessions() as session:
        current = await read_authority(session, "execution-1")
        await revoke_authority(
            session,
            "execution-1",
            expected_capability_id=current.binding.authority.capability_id,
            revoked_at=NOW + timedelta(minutes=1),
        )
        await session.commit()
    async with database.sessions() as session:
        replay = await recover_initial_authority(
            session, request=database.request, request_bytes=database.request_bytes, identity=database.identity,
        )
        assert replay == first
    changed_bytes = database.request_bytes + b" "
    async with database.sessions() as session:
        with pytest.raises(RecoveryConflict, match="initial_recovery_request_replay_conflict"):
            await recover_initial_authority(
                session, request=database.request, request_bytes=changed_bytes, identity=database.identity,
            )


@pytest.mark.asyncio
async def test_open_admission_does_not_create_authority(database):
    async with database.sessions() as session:
        correlation = (
            await session.execute(select(TrellisJobCorrelation).where(TrellisJobCorrelation.engine_job_id == JOB_ID))
        ).scalar_one()
        correlation.admission_receipt_bytes = b"{}"
        await session.commit()
    async with database.sessions() as session:
        with pytest.raises(RecoveryConflict, match="initial_recovery_correlation_conflict"):
            await recover_initial_authority(
                session, request=database.request, request_bytes=database.request_bytes, identity=database.identity,
            )
        assert await read_authority(session, "execution-1") is None


@pytest.mark.asyncio
async def test_same_owner_recovery_requires_an_expired_predecessor(database):
    request, request_bytes, _ = recovery_request(takeover=False)
    identity = database.identity.model_copy(update={
        "owner_id": "owner-1",
        "instance_id": "00000000-0000-4000-8000-000000000005",
        "manifest_digest": "a" * 64,
    })
    async with database.sessions() as session:
        response = await recover_initial_authority(
            session, request=request, request_bytes=request_bytes, identity=identity,
        )
        await session.commit()
    assert json.loads(response)["state"] == "committed"


def test_same_owner_recovery_refuses_an_unexpired_predecessor():
    request, _, _ = recovery_request(takeover=False)
    with pytest.raises(RecoveryConflict, match="successor_renewal_conflict"):
        parse_recovery_envelope(request, NOW - timedelta(hours=2))


@pytest.mark.asyncio
async def test_changed_revocation_does_not_create_authority(database):
    value = json.loads(database.request_bytes)
    commit = json.loads(value["successorCommitBytes"])
    commit["revocation"]["observationId"] = "changed-observation"
    value["successorCommitBytes"] = json.dumps(commit, separators=(",", ":"))
    request_bytes = json.dumps(value, separators=(",", ":")).encode()
    request = RecoveryRequest.model_validate_json(request_bytes)
    async with database.sessions() as session:
        with pytest.raises(RecoveryConflict, match="successor_takeover_conflict"):
            await recover_initial_authority(
                session, request=request, request_bytes=request_bytes, identity=database.identity,
            )
        assert await read_authority(session, "execution-1") is None


@pytest.mark.asyncio
async def test_changed_stop_bytes_do_not_create_authority(database):
    value = json.loads(database.request_bytes)
    commit = json.loads(value["successorCommitBytes"])
    commit["takeoverStops"]["sourceDigest"] = "f" * 64
    value["successorCommitBytes"] = json.dumps(commit, separators=(",", ":"))
    request_bytes = json.dumps(value, separators=(",", ":")).encode()
    request = RecoveryRequest.model_validate_json(request_bytes)
    async with database.sessions() as session:
        with pytest.raises(RecoveryConflict, match="successor_takeover_conflict"):
            await recover_initial_authority(
                session, request=request, request_bytes=request_bytes, identity=database.identity,
            )
        assert await read_authority(session, "execution-1") is None


@pytest.mark.asyncio
async def test_changed_dispatch_permit_does_not_create_authority(database):
    value = json.loads(database.request_bytes)
    commit = json.loads(value["successorCommitBytes"])
    commit["permit"]["binding"]["payloadDigest"] = "f" * 64
    value["successorCommitBytes"] = json.dumps(commit, separators=(",", ":"))
    request_bytes = json.dumps(value, separators=(",", ":")).encode()
    request = RecoveryRequest.model_validate_json(request_bytes)
    async with database.sessions() as session:
        with pytest.raises(RecoveryConflict, match="successor_permit_conflict"):
            await recover_initial_authority(
                session, request=request, request_bytes=request_bytes, identity=database.identity,
            )
        assert await read_authority(session, "execution-1") is None


@pytest.mark.asyncio
async def test_same_request_id_with_changed_successor_is_a_replay_conflict(database):
    async with database.sessions() as session:
        await recover_initial_authority(
            session, request=database.request, request_bytes=database.request_bytes, identity=database.identity,
        )
        await session.commit()
    value = json.loads(database.request_bytes)
    value["successorCommitBytes"] += " "
    changed_bytes = json.dumps(value, separators=(",", ":")).encode()
    changed = RecoveryRequest.model_validate_json(changed_bytes)
    async with database.sessions() as session:
        with pytest.raises(RecoveryConflict, match="initial_recovery_request_replay_conflict"):
            await recover_initial_authority(
                session, request=changed, request_bytes=changed_bytes, identity=database.identity,
            )
