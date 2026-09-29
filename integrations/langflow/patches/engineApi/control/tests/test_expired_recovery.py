from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from langflow.services.database.models.jobs.model import Job, JobStatus
from langflow.services.trellis_v1.authority import (
    AuthorityUnauthorized,
    TrellisDeliveryAuthority,
    commit_authority,
    parse_authority,
    revoke_authority,
)
from langflow.services.trellis_v1.cancellation import accept_cancellation, assert_not_cancelled, read_cancellation
from langflow.services.trellis_v1.cancellation_effects import drain_cancellation
from langflow.services.trellis_v1.cancellation_models import CancellationConflict

pytestmark = pytest.mark.asyncio


async def test_unknown_cancel_after_outage_uses_successor_grant_without_resuming_job(fixture):
    now = datetime.now(timezone.utc)
    old = json.loads(fixture.input.authority_bytes)
    old["issuedAt"] = (now - timedelta(hours=3)).isoformat()
    old["expiresAt"] = (now - timedelta(hours=1)).isoformat()
    expired_bytes = json.dumps(old)
    binding = parse_authority(expired_bytes.encode())
    request = fixture.input.model_copy(update={"authority_bytes": expired_bytes})
    async with fixture.sessions() as session:
        saved = await session.get(TrellisDeliveryAuthority, "execution-1")
        saved.authority_bytes = binding.authority_bytes
        saved.authority_digest = binding.authority_digest
        saved.expires_at = binding.authority.expires_at
        await session.commit()
    async with fixture.sessions() as session:
        with pytest.raises(AuthorityUnauthorized):
            await accept_cancellation(session, fixture.security, request)
        await session.rollback()
    async with fixture.sessions() as session:
        assert await read_cancellation(session, fixture.job_id) is None
        await revoke_authority(session, "execution-1", expected_capability_id="capability-1", revoked_at=now)
        await session.commit()
    successor = {
        **old, "ownerId": "recovered-owner", "engineEpoch": 2, "ownershipRevision": 2,
        "capabilityId": "cancel-recovery-grant", "permissions": ["execution.cancel"],
        "issuedAt": now.isoformat(), "expiresAt": (now + timedelta(hours=1)).isoformat(),
    }
    successor_bytes = json.dumps(successor)
    async with fixture.sessions() as session:
        await commit_authority(session, successor_bytes.encode(), expected_capability_id="capability-1")
        await session.commit()
    retry = request.model_copy(update={"authority_bytes": successor_bytes})
    assert retry.request_bytes() == request.request_bytes()
    async with fixture.sessions() as session:
        receipt = await accept_cancellation(session, fixture.security, retry)
        await session.commit()
    async with fixture.sessions() as session:
        assert await accept_cancellation(session, fixture.security, retry) == receipt
        assert (await read_cancellation(session, fixture.job_id)).request_bytes == request.request_bytes()
        await session.get(Job, fixture.job_id, with_for_update=True)
        with pytest.raises(CancellationConflict, match="execution_cancelled"):
            await assert_not_cancelled(session, fixture.job_id)
        with pytest.raises(AuthorityUnauthorized):
            await fixture.security.require_authority(
                session, successor_bytes.encode(), "completion.deliver",
                execution_id="execution-1", publication_id="publication-1", engine_job_id=fixture.job_id,
            )
    background = SimpleNamespace(stop_job=AsyncMock(return_value=None))
    assert await drain_cancellation(fixture.sessions, background, fixture.job_id) == JobStatus.IN_PROGRESS
    background.stop_job.assert_awaited_once()
    async with fixture.sessions() as session:
        job = await session.get(Job, fixture.job_id)
        assert job.status == JobStatus.IN_PROGRESS
        assert job.result is None
        assert job.error is None
