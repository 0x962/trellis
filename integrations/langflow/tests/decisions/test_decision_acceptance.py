from __future__ import annotations

import asyncio
import hashlib
import json
import multiprocessing
import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlmodel import SQLModel, func, select

from integrations.langflow.tests.decisions.authority_probe import seed_authority, stored_authority
from integrations.langflow.tests.decisions.decision_probe import (
    CHECKPOINT_FIXTURE,
    FLOW_ID,
    JOB_ID,
    decision_bytes,
    digest,
    human_wait,
    open_session,
)

from langflow.services.database.models.jobs.model import (
    ExecutionSignal,
    Job,
    JobEvent,
    JobStatus,
    JobType,
)
from langflow.services.jobs.exceptions import HUMAN_INPUT_REQUIRED_EVENT
from langflow.services.trellis_v1.authority import AuthorityUnauthorized, revoke_authority
from langflow.services.trellis_v1.decisions import (
    DecisionAcceptanceLedger,
    DecisionConflictError,
    DecisionNotPendingError,
    TrellisDecisionAcceptance,
    TrellisDecisionEnqueueObligation,
)

def _wait(payload: bytes) -> dict:
    return json.loads(payload)["wait"]


async def _initialize(
    database_url: str, payload: bytes | None = None, *, with_authority: bool = True
) -> None:
    engine, session_scope = open_session(database_url)
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    if payload is None:
        payload = decision_bytes()
        assert human_wait()["request"] == _wait(payload)
    async with session_scope() as session:
        session.add(
            Job(
                job_id=JOB_ID,
                flow_id=FLOW_ID,
                status=JobStatus.SUSPENDED,
                type=JobType.WORKFLOW,
                job_metadata={"pending_request_id": "human-request-1"},
            )
        )
        session.add(
            JobEvent(
                job_id=JOB_ID,
                seq=1,
                event_type=HUMAN_INPUT_REQUIRED_EVENT,
                payload={
                    "request_id": "human-request-1",
                    "trellis_wait_v1": _wait(payload),
                },
            )
        )
        if with_authority:
            await seed_authority(session, _wait(payload))
    await engine.dispose()


async def _accept(database_url: str, *, fault_point: str | None = None) -> dict:
    engine, session_scope = open_session(database_url)
    ledger = DecisionAcceptanceLedger(open_session=session_scope)

    def fault(point: str) -> None:
        if point == fault_point:
            os._exit(91)

    payload = decision_bytes()
    receipt = await ledger.accept(
        engine_job_id=JOB_ID,
        decision_bytes=payload,
        payload_digest=digest(payload),
        authority_bytes=await stored_authority(database_url),
        fault=fault,
    )
    await engine.dispose()
    return receipt


def _crash_accept(database_url: str, fault_point: str) -> None:
    asyncio.run(_accept(database_url, fault_point=fault_point))


async def _counts(database_url: str) -> tuple[int, int, int, JobStatus]:
    engine, session_scope = open_session(database_url)
    async with session_scope() as session:
        acceptances = (await session.exec(select(func.count()).select_from(TrellisDecisionAcceptance))).one()
        signals = (await session.exec(select(func.count()).select_from(ExecutionSignal))).one()
        obligations = (
            await session.exec(select(func.count()).select_from(TrellisDecisionEnqueueObligation))
        ).one()
        job = await session.get(Job, JOB_ID)
        assert job is not None
        status = job.status
    await engine.dispose()
    return acceptances, signals, obligations, status


@pytest.mark.parametrize(
    "fault_point",
    ["before_transaction", "after_acceptance", "after_signal", "after_enqueue_obligation"],
)
def test_a_kill_inside_the_transaction_leaves_no_partial_acceptance(tmp_path: Path, fault_point: str) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / f'{fault_point}.db'}"
    asyncio.run(_initialize(database_url))
    process = multiprocessing.get_context("spawn").Process(target=_crash_accept, args=(database_url, fault_point))
    process.start()
    process.join(30)
    assert process.exitcode == 91
    assert asyncio.run(_counts(database_url)) == (0, 0, 0, JobStatus.SUSPENDED)


def test_published_checkpoint_keeps_wait_and_request_identities_distinct() -> None:
    wait = human_wait()
    assert hashlib.sha256(CHECKPOINT_FIXTURE.read_bytes()).hexdigest() == (
        "37bab5d39fa9a85ba0ec1c9c381e8386dd75debb9770db7257bfdc7f126ec65d"
    )
    assert hashlib.sha256(decision_bytes()).hexdigest() == (
        "dcf169b7f9dd00e968f9e54c0c6799f724e97a36cac9046ba5b5834cccf60e3c"
    )
    assert wait["waitId"] == "human-wait-1"
    assert wait["request"]["engineRequestId"] == "human-request-1"
    assert wait["waitId"] != wait["request"]["engineRequestId"]


def test_a_lost_response_returns_the_original_receipt_and_one_obligation(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'lost-response.db'}"
    asyncio.run(_initialize(database_url))
    process = multiprocessing.get_context("spawn").Process(
        target=_crash_accept,
        args=(database_url, "after_commit"),
    )
    process.start()
    process.join(30)
    assert process.exitcode == 91

    first_replay = asyncio.run(_accept(database_url))
    second_replay = asyncio.run(_accept(database_url))

    async def stored_receipt() -> bytes:
        engine, session_scope = open_session(database_url)
        async with session_scope() as session:
            acceptance = await session.get(TrellisDecisionAcceptance, "decision-1")
            assert acceptance is not None
            receipt_bytes = acceptance.receipt_bytes
        await engine.dispose()
        return receipt_bytes

    assert first_replay == second_replay
    assert asyncio.run(stored_receipt()) == json.dumps(first_replay, separators=(",", ":")).encode()
    assert asyncio.run(_counts(database_url)) == (1, 1, 1, JobStatus.SUSPENDED)


def test_changed_bytes_conflict_with_the_saved_decision(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'changed.db'}"
    asyncio.run(_initialize(database_url))
    asyncio.run(_accept(database_url))
    changed = decision_bytes().replace(b"Approved fixture", b"Rejected fixture")

    async def run() -> None:
        engine, session_scope = open_session(database_url)
        ledger = DecisionAcceptanceLedger(open_session=session_scope)
        with pytest.raises(DecisionConflictError):
            await ledger.accept(
                engine_job_id=JOB_ID,
                decision_bytes=changed,
                payload_digest=digest(changed),
                authority_bytes=await stored_authority(database_url),
            )
        await engine.dispose()

    asyncio.run(run())


def test_an_old_decision_cannot_answer_a_later_wait(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'later-wait.db'}"
    asyncio.run(_initialize(database_url))

    async def move_to_later_wait() -> None:
        engine, session_scope = open_session(database_url)
        later_wait = _wait(decision_bytes())
        later_wait["engineRequestId"] = "human-request-2"
        later_wait["occurrence"]["occurrenceKey"] = "outer-2.inner-3.later-human"
        async with session_scope() as session:
            session.add(
                JobEvent(
                    job_id=JOB_ID,
                    seq=2,
                    event_type=HUMAN_INPUT_REQUIRED_EVENT,
                    payload={"request_id": "human-request-2", "trellis_wait_v1": later_wait},
                )
            )
        await engine.dispose()

    asyncio.run(move_to_later_wait())
    with pytest.raises(DecisionNotPendingError):
        asyncio.run(_accept(database_url))


def test_lookup_confirms_only_the_exact_saved_identity(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'lookup.db'}"
    asyncio.run(_initialize(database_url))
    receipt = asyncio.run(_accept(database_url))

    async def revoke() -> None:
        authority = json.loads(await stored_authority(database_url))
        engine, session_scope = open_session(database_url)
        async with session_scope() as session:
            await revoke_authority(
                session,
                "execution-1",
                expected_capability_id=authority["capabilityId"],
                revoked_at=datetime.now(timezone.utc),
            )
        await engine.dispose()

    asyncio.run(revoke())
    with pytest.raises(AuthorityUnauthorized):
        asyncio.run(_accept(database_url))

    async def lookup(payload_digest: str, engine_request_id: str) -> dict:
        engine, session_scope = open_session(database_url)
        ledger = DecisionAcceptanceLedger(open_session=session_scope)
        result = await ledger.lookup(
            execution_id="execution-1",
            engine_job_id=JOB_ID,
            engine_request_id=engine_request_id,
            decision_id="decision-1",
            payload_digest=payload_digest,
        )
        await engine.dispose()
        return result

    accepted = asyncio.run(lookup(receipt["payloadDigest"], "human-request-1"))
    conflict = asyncio.run(lookup("0" * 64, "human-request-2"))
    assert accepted == {"state": "accepted", "receipt": receipt}
    assert conflict["state"] == "conflict"
    assert conflict["acceptedDigest"] == receipt["payloadDigest"]
