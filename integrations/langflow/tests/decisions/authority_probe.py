import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from integrations.langflow.tests.decisions.decision_probe import open_session
from langflow.services.trellis_v1.authority import commit_authority, read_authority

FIXTURE = Path(__file__).parent / "fixtures" / "authority.json"


async def seed_authority(session, wait: dict) -> bytes:
    authority = json.loads(FIXTURE.read_bytes())
    now = datetime.now(timezone.utc)
    authority.update(
        executionId=wait["executionId"],
        publicationId=wait["publicationId"],
        engineJobId=wait["engineJobId"],
        engineEpoch=1,
        ownershipRevision=1,
        permissions=["decision.deliver"],
        issuedAt=now.isoformat(),
        expiresAt=(now + timedelta(hours=1)).isoformat(),
    )
    exact_bytes = json.dumps(authority, indent=2).encode()
    await commit_authority(session, exact_bytes, expected_capability_id=None)
    return exact_bytes


async def stored_authority(database_url: str, execution_id: str = "execution-1") -> bytes:
    engine, sessions = open_session(database_url)
    async with sessions() as session:
        state = await read_authority(session, execution_id)
        assert state is not None
        exact_bytes = state.binding.authority_bytes
    await engine.dispose()
    return exact_bytes
