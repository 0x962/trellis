from __future__ import annotations

from uuid import UUID

from sqlmodel import select

from langflow.services.deps import session_scope
from langflow.services.trellis_v1.correlation import CorrelationKey, TrellisJobCorrelation


async def read_correlation(host_id: str, execution_id: str) -> TrellisJobCorrelation | None:
    async with session_scope() as session:
        return (await session.exec(select(TrellisJobCorrelation).where(
            TrellisJobCorrelation.host_id == host_id,
            TrellisJobCorrelation.execution_id == execution_id,
        ))).first()


def actor_key(row: TrellisJobCorrelation) -> CorrelationKey:
    return CorrelationKey(actor_kind=row.actor_kind, actor_name=row.actor_name, request_id=UUID(str(row.request_id)))
