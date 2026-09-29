from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from langflow.services.trellis_v1.authority import (
    AuthorityConflict,
    AuthorityUnauthorized,
    commit_authority,
    require_authority,
    revoke_authority,
)


class Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class Session:
    def __init__(self):
        self.current = None
        self.flushes = 0

    async def execute(self, _statement):
        return Result(self.current)

    def add(self, value):
        self.current = value

    async def flush(self):
        self.flushes += 1


def authority_bytes(
    *,
    owner: str = "owner-1",
    capability: str = "capability-1",
    epoch: int = 1,
    revision: int = 1,
    permissions: list[str] | None = None,
) -> bytes:
    now = datetime.now(timezone.utc)
    value = {
        "version": 1,
        "executionId": "execution-1",
        "publicationId": "publication-1",
        "engineJobId": "00000000-0000-4000-8000-000000000001",
        "engineEpoch": epoch,
        "hostId": "host-1",
        "projectId": "project-1",
        "publicationDigest": "a" * 64,
        "ownerId": owner,
        "ownershipRevision": revision,
        "capabilityId": capability,
        "permissions": permissions or ["decision.deliver", "execution.cancel"],
        "issuedAt": now.isoformat().replace("+00:00", "Z"),
        "expiresAt": (now + timedelta(hours=1)).isoformat().replace("+00:00", "Z"),
    }
    return json.dumps(value, separators=(",", ":")).encode()


@pytest.mark.asyncio
async def test_authority_retains_exact_bytes_and_advances_one_revision():
    session = Session()
    initial = authority_bytes()
    saved = await commit_authority(session, initial, expected_capability_id=None)
    assert saved.authority_bytes == initial
    assert session.current.authority_bytes == initial

    renewal = authority_bytes(capability="capability-2", revision=2)
    updated = await commit_authority(session, renewal, expected_capability_id="capability-1")
    assert updated.authority_bytes == renewal
    assert session.current.authority_bytes == renewal

    await revoke_authority(
        session,
        "execution-1",
        expected_capability_id="capability-2",
        revoked_at=datetime.now(timezone.utc),
    )
    takeover = authority_bytes(owner="owner-2", capability="capability-3", epoch=2, revision=3)
    transferred = await commit_authority(session, takeover, expected_capability_id="capability-2")
    assert transferred.engine_epoch == 2
    assert session.current.authority_bytes == takeover

    skipped = authority_bytes(owner="owner-3", capability="capability-4", epoch=4, revision=4)
    with pytest.raises(AuthorityConflict, match="authority_transition_conflict"):
        await commit_authority(session, skipped, expected_capability_id="capability-3")


@pytest.mark.asyncio
async def test_require_authority_uses_the_exact_current_bytes_and_binding():
    session = Session()
    current = authority_bytes()
    await commit_authority(session, current, expected_capability_id=None)

    binding = await require_authority(
        session,
        current,
        "decision.deliver",
        execution_id="execution-1",
        publication_id="publication-1",
        engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
    )
    assert binding.authority_bytes == current
    assert binding.engine_epoch == 1

    changed = current.replace(b'"owner-1"', b'"owner-2"')
    with pytest.raises(AuthorityUnauthorized, match="authority_not_current"):
        await require_authority(
            session,
            changed,
            "decision.deliver",
            execution_id="execution-1",
            publication_id="publication-1",
            engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
        )


@pytest.mark.asyncio
async def test_revocation_retains_only_the_cancel_permission():
    session = Session()
    current = authority_bytes()
    await commit_authority(session, current, expected_capability_id=None)
    await revoke_authority(
        session,
        "execution-1",
        expected_capability_id="capability-1",
        revoked_at=datetime.now(timezone.utc),
    )

    await require_authority(
        session,
        current,
        "execution.cancel",
        execution_id="execution-1",
        publication_id="publication-1",
        engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
    )
    with pytest.raises(AuthorityUnauthorized, match="authority_not_current"):
        await require_authority(
            session,
            current,
            "decision.deliver",
            execution_id="execution-1",
            publication_id="publication-1",
            engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
        )

    successor = authority_bytes(owner="owner-2", capability="capability-2", epoch=2, revision=2)
    await commit_authority(session, successor, expected_capability_id="capability-1")
    with pytest.raises(AuthorityUnauthorized, match="authority_not_current"):
        await require_authority(
            session,
            current,
            "execution.cancel",
            execution_id="execution-1",
            publication_id="publication-1",
            engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
        )
    accepted = await require_authority(
        session,
        successor,
        "execution.cancel",
        execution_id="execution-1",
        publication_id="publication-1",
        engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
    )
    assert accepted.engine_epoch == 2


@pytest.mark.asyncio
async def test_review_classification_uses_its_own_permission():
    session = Session()
    current = authority_bytes(permissions=["review.classify"])
    await commit_authority(session, current, expected_capability_id=None)

    accepted = await require_authority(
        session,
        current,
        "review.classify",
        execution_id="execution-1",
        publication_id="publication-1",
        engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
    )
    assert accepted.authority.permissions == ("review.classify",)
    with pytest.raises(AuthorityUnauthorized, match="authority_not_current"):
        await require_authority(
            session,
            current,
            "native.reserve",
            execution_id="execution-1",
            publication_id="publication-1",
            engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
        )


@pytest.mark.asyncio
async def test_classification_delivery_uses_its_own_permission():
    session = Session()
    current = authority_bytes(permissions=["classification.deliver"])
    await commit_authority(session, current, expected_capability_id=None)

    accepted = await require_authority(
        session,
        current,
        "classification.deliver",
        execution_id="execution-1",
        publication_id="publication-1",
        engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
    )
    assert accepted.authority.permissions == ("classification.deliver",)
    with pytest.raises(AuthorityUnauthorized, match="authority_not_current"):
        await require_authority(
            session,
            current,
            "review.classify",
            execution_id="execution-1",
            publication_id="publication-1",
            engine_job_id=UUID("00000000-0000-4000-8000-000000000001"),
        )
