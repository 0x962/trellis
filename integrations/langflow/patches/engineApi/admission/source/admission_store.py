from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from langflow.services.trellis_v1.correlation import (
    AdmissionCommit, AdmissionContinuation, JobServiceCorrelationStore, StoredCorrelation,
)


AuthorityVerifier = Callable[[AsyncSession], Awaitable[None]]


class AuthorizedCorrelationStore(JobServiceCorrelationStore):
    def __init__(self, jobs, *, flow_id: UUID, user_id: UUID,
                 require_authority: AuthorityVerifier):
        super().__init__(jobs, flow_id=flow_id, user_id=user_id)
        self.require_authority = require_authority

    async def commit_admission(self, candidate: StoredCorrelation, admission_bytes: bytes,
                               continuation: AdmissionContinuation) -> AdmissionCommit:
        return await self._jobs.commit_trellis_admission(
            candidate, admission_bytes, continuation, require_authority=self.require_authority,
        )
