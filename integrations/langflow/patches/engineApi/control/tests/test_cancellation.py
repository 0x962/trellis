from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from langflow.services.database.models.jobs.model import ExecutionSignal, Job, JobCheckpoint, JobStatus
from langflow.services.trellis_v1.authority import AuthorityUnauthorized, TrellisDeliveryAuthority, parse_authority, revoke_authority
from langflow.services.trellis_v1.cancellation import accept_cancellation, assert_not_cancelled, read_cancellation
from langflow.services.trellis_v1.cancellation_effects import drain_cancellation, replay_cancellations
from langflow.services.trellis_v1.cancellation_models import CancellationConflict

pytestmark = pytest.mark.asyncio


async def accept(fixture):
    async with fixture.sessions() as session:
        receipt = await accept_cancellation(session, fixture.security, fixture.input)
        await session.commit()
        return receipt


async def test_receipt_replay_survives_database_reopen(fixture):
    original = await accept(fixture)
    await fixture.engine.dispose()
    assert await accept(fixture) == original
    async with fixture.sessions() as session:
        assert (await session.execute(select(func.count()).select_from(ExecutionSignal))).scalar_one() == 1
        assert (await session.execute(select(func.count()).select_from(JobCheckpoint))).scalar_one() == 1
        assert (await read_cancellation(session, fixture.job_id)).receipt == original


async def test_changed_request_bytes_conflict(fixture):
    await accept(fixture)
    intent = json.loads(fixture.input.cancel_intent_bytes)
    intent["expectedRevision"] = 2
    changed = fixture.input.model_copy(update={"cancel_intent_bytes": json.dumps(intent)})
    async with fixture.sessions() as session:
        with pytest.raises(CancellationConflict, match="cancellation_identity_conflict"):
            await accept_cancellation(session, fixture.security, changed)


async def test_rollback_removes_marker_and_stop_together(fixture):
    async with fixture.sessions() as session:
        await accept_cancellation(session, fixture.security, fixture.input)
        await session.rollback()
    async with fixture.sessions() as session:
        assert await read_cancellation(session, fixture.job_id) is None
        assert (await session.execute(select(func.count()).select_from(ExecutionSignal))).scalar_one() == 0
        await assert_not_cancelled(session, fixture.job_id)


async def test_consumed_stop_keeps_completion_guard(fixture):
    receipt = await accept(fixture)
    async with fixture.sessions() as session:
        signal = await session.get(ExecutionSignal, receipt.receipt_id)
        signal.consumed_at = datetime.now(timezone.utc)
        await session.commit()
    async with fixture.sessions() as session:
        await session.execute(select(Job).where(Job.job_id == fixture.job_id).with_for_update())
        with pytest.raises(CancellationConflict, match="execution_cancelled"):
            await assert_not_cancelled(session, fixture.job_id)


@pytest.mark.parametrize("status", [JobStatus.FAILED, JobStatus.TIMED_OUT, JobStatus.COMPLETED, JobStatus.CANCELLED])
async def test_terminal_engine_state_stays_unchanged(fixture, status):
    await accept(fixture)
    async with fixture.sessions() as session:
        job = await session.get(Job, fixture.job_id)
        job.status = status
        job.error = {"kind": "actual_failure"}
        await session.commit()
    background = SimpleNamespace(stop_job=AsyncMock())
    assert await drain_cancellation(fixture.sessions, background, fixture.job_id) == status
    background.stop_job.assert_not_awaited()
    async with fixture.sessions() as session:
        assert (await session.get(Job, fixture.job_id)).error == {"kind": "actual_failure"}


async def test_failed_effect_retains_receipt_for_startup_replay(fixture):
    receipt = await accept(fixture)
    background = SimpleNamespace(stop_job=AsyncMock(side_effect=OSError("engine unavailable")))
    with pytest.raises(OSError, match="engine unavailable"):
        await drain_cancellation(fixture.sessions, background, fixture.job_id)
    async with fixture.sessions() as session:
        assert (await read_cancellation(session, fixture.job_id)).receipt == receipt
    background.stop_job.side_effect = None
    background.stop_job.return_value = None
    await replay_cancellations(fixture.sessions, background)
    assert background.stop_job.await_count == 2
    assert background.stop_job.call_args.args[0] == fixture.job_id
    assert background.stop_job.call_args.args[1].id == fixture.user_id
    async with fixture.sessions() as session:
        assert (await session.get(Job, fixture.job_id)).status == JobStatus.IN_PROGRESS


async def test_revoked_owner_can_cancel_with_exact_unexpired_grant(fixture):
    async with fixture.sessions() as session:
        await revoke_authority(session, "execution-1", expected_capability_id="capability-1",
                               revoked_at=datetime.now(timezone.utc))
        await session.commit()
    await accept(fixture)
    async with fixture.sessions() as session:
        with pytest.raises(AuthorityUnauthorized):
            await fixture.security.require_authority(
                session, fixture.input.authority_bytes.encode(), "completion.deliver",
                execution_id="execution-1", publication_id="publication-1", engine_job_id=fixture.job_id,
            )


async def test_expired_grant_cannot_accept_new_cancellation(fixture):
    expired = json.loads(fixture.input.authority_bytes)
    expired["issuedAt"] = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    expired["expiresAt"] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    changed = fixture.input.model_copy(update={"authority_bytes": json.dumps(expired)})
    binding = parse_authority(changed.authority_bytes.encode())
    async with fixture.sessions() as session:
        row = await session.get(TrellisDeliveryAuthority, "execution-1")
        row.authority_bytes = binding.authority_bytes
        row.authority_digest = binding.authority_digest
        row.expires_at = binding.authority.expires_at
        await session.commit()
    async with fixture.sessions() as session:
        with pytest.raises(AuthorityUnauthorized):
            await accept_cancellation(session, fixture.security, changed)
        await session.rollback()
    async with fixture.sessions() as session:
        assert await read_cancellation(session, fixture.job_id) is None
