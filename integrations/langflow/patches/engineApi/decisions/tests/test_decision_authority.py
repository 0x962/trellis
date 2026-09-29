import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from integrations.langflow.tests.decisions.decision_probe import (
    JOB_ID,
    decision_bytes,
    digest,
    open_session,
)
from integrations.langflow.tests.decisions.test_decision_acceptance import _counts, _initialize
from langflow.services.trellis_v1 import authority as authority_module
from langflow.services.trellis_v1.authority import (
    AuthorityUnauthorized,
    commit_authority,
    read_authority,
    revoke_authority,
)
from langflow.services.trellis_v1.decisions import (
    DecisionAcceptanceLedger,
    DecisionConflictError,
    TrellisDecisionAcceptance,
)

FIXTURES = Path(__file__).resolve().parents[6] / "apps/server/src/langflowContracts/fixtures"


def grant_bytes(*, permission="decision.deliver"):
    grant = json.loads((FIXTURES / "authority.json").read_text())
    now = datetime.now(timezone.utc)
    grant.update(
        engineEpoch=1,
        ownershipRevision=1,
        permissions=[permission],
        issuedAt=now.isoformat(),
        expiresAt=(now + timedelta(hours=1)).isoformat(),
    )
    return json.dumps(grant, indent=2).encode()


async def seed(database_url, payload, authority_bytes):
    await _initialize(database_url, payload)
    engine, sessions = open_session(database_url)
    async with sessions() as session:
        await commit_authority(session, authority_bytes, expected_capability_id=None)
    await engine.dispose()


@pytest.mark.parametrize("refusal", ["absent", "bytes", "permission", "revoked", "expired", "stale", "job"])
def test_refused_authority_leaves_all_decision_records_absent(tmp_path, monkeypatch, refusal):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'authority.db'}"
    payload = decision_bytes()
    authority_bytes = grant_bytes(permission="native.read" if refusal == "permission" else "decision.deliver")

    async def run():
        if refusal == "absent":
            await _initialize(database_url, payload)
        else:
            await seed(database_url, payload, authority_bytes)
        engine, sessions = open_session(database_url)
        supplied = authority_bytes
        decision = payload
        job_id = JOB_ID
        if refusal == "bytes":
            supplied += b"\n"
        elif refusal == "revoked":
            async with sessions() as session:
                await revoke_authority(
                    session,
                    "execution-1",
                    expected_capability_id=json.loads(authority_bytes)["capabilityId"],
                    revoked_at=datetime.now(timezone.utc),
                )
        elif refusal == "expired":
            future = datetime.now(timezone.utc) + timedelta(hours=2)

            class FutureClock(datetime):
                @classmethod
                def now(cls, tz=None):
                    return future if tz is not None else future.replace(tzinfo=None)

            monkeypatch.setattr(authority_module, "datetime", FutureClock)
        elif refusal == "stale":
            current = json.loads(authority_bytes)
            renewed = current | {"ownershipRevision": 2, "capabilityId": "renewed-capability"}
            async with sessions() as session:
                await commit_authority(
                    session,
                    json.dumps(renewed).encode(),
                    expected_capability_id=current["capabilityId"],
                )
        elif refusal == "job":
            changed = json.loads(payload)
            job_id = uuid4()
            changed["wait"]["engineJobId"] = str(job_id)
            decision = json.dumps(changed).encode()
        ledger = DecisionAcceptanceLedger(open_session=sessions)
        with pytest.raises(AuthorityUnauthorized):
            await ledger.accept(
                engine_job_id=job_id,
                decision_bytes=decision,
                payload_digest=digest(decision),
                authority_bytes=supplied,
            )
        await engine.dispose()
        assert (await _counts(database_url))[:3] == (0, 0, 0)

    asyncio.run(run())


def test_real_ledger_recovers_original_negative_receipt_after_revocation(tmp_path):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'recovery.db'}"
    decision = json.loads(decision_bytes())
    decision.update(approved=False, output="Retained feedback 漢字\n" * 10_000)
    payload = json.dumps(decision, ensure_ascii=False, indent=2).encode()
    authority_bytes = grant_bytes()

    async def run():
        await seed(database_url, payload, authority_bytes)
        engine, sessions = open_session(database_url)
        ledger = DecisionAcceptanceLedger(open_session=sessions)
        request = dict(
            engine_job_id=JOB_ID,
            decision_bytes=payload,
            payload_digest=digest(payload),
            authority_bytes=authority_bytes,
        )
        first = await ledger.accept(**request)
        assert await ledger.accept(**request) == first
        changed = payload + b"\n"
        with pytest.raises(DecisionConflictError):
            await ledger.accept(**(request | {"decision_bytes": changed, "payload_digest": digest(changed)}))
        async with sessions() as session:
            saved = await session.get(TrellisDecisionAcceptance, decision["decisionId"])
            assert saved.decision_bytes == payload
            assert saved.payload_digest == digest(payload)
            current = await read_authority(session, "execution-1")
            assert current.binding.authority_bytes == authority_bytes
            await revoke_authority(
                session,
                "execution-1",
                expected_capability_id=json.loads(authority_bytes)["capabilityId"],
                revoked_at=datetime.now(timezone.utc),
            )
        recovered = await ledger.lookup(
            execution_id="execution-1",
            engine_job_id=JOB_ID,
            engine_request_id=decision["wait"]["engineRequestId"],
            decision_id=decision["decisionId"],
            payload_digest=digest(payload),
        )
        assert recovered == {"state": "accepted", "receipt": first}
        with pytest.raises(AuthorityUnauthorized):
            await ledger.accept(**request)
        await engine.dispose()
        assert (await _counts(database_url))[:3] == (1, 1, 1)

    asyncio.run(run())
