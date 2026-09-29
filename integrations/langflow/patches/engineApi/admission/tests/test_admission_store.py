from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

import pytest

from langflow.services.trellis_v1.admission_store import AuthorizedCorrelationStore
from langflow.services.trellis_v1.engine_api import AuthorityUnauthorized


@pytest.mark.asyncio
@pytest.mark.parametrize("revoked", [False, True])
async def test_store_passes_verifier_into_the_admission_transaction(revoked):
    session = object()
    events = []
    candidate = object()
    continuation = object()
    expected = object()

    async def verify(actual_session):
        assert actual_session is session
        events.append("verify")
        if revoked:
            raise AuthorityUnauthorized("revoked")

    async def commit(actual_candidate, admission_bytes, actual_continuation, *, require_authority):
        assert actual_candidate is candidate
        assert actual_continuation is continuation
        assert admission_bytes == b"exact receipt"
        events.append("job_locked")
        await require_authority(session)
        events.append("commit")
        return expected

    store = AuthorizedCorrelationStore(
        SimpleNamespace(commit_trellis_admission=commit), flow_id=UUID(int=1), user_id=UUID(int=2),
        require_authority=verify,
    )
    if revoked:
        with pytest.raises(AuthorityUnauthorized):
            await store.commit_admission(candidate, b"exact receipt", continuation)
        assert events == ["job_locked", "verify"]
    else:
        assert await store.commit_admission(candidate, b"exact receipt", continuation) is expected
        assert events == ["job_locked", "verify", "commit"]
