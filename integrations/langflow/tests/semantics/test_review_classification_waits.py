from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path
from uuid import UUID

import pytest
from sqlmodel import SQLModel, select

from integrations.langflow.tests.decisions.decision_probe import FLOW_ID, open_session
from langflow.services.database.models.jobs.model import ExecutionSignal, Job, JobCheckpoint, JobStatus, JobType
from langflow.services.jobs.service import JobService
from langflow.services.trellis_v1.cancellation_models import CancellationConflict
from langflow.services.trellis_v1.native_records import add_checkpoint
from langflow.services.trellis_v1.review_classifications import ReviewClassificationLedger
from langflow.services.trellis_v1.review_protocol import ReviewConflict, ReviewDeliveryInput, review_json

ROOT = Path(__file__).parents[4]
FIXTURES = ROOT / "apps/server/src/langflowContracts/fixtures"


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_bytes())


def delivery_fixture() -> tuple[ReviewDeliveryInput, dict, dict]:
    wait = fixture("review-external-wait")
    response = fixture("review-classification-response")
    authority = fixture("review-classification-delivery")["authority"]
    result_bytes = review_json(response).encode()
    delivery_bytes = review_json({
        "version": 1,
        "wait": wait["request"],
        "result": response,
        "resultDigest": hashlib.sha256(result_bytes).hexdigest(),
        "authority": authority,
    }).encode()
    return (
        ReviewDeliveryInput(
            engineWaitId=wait["waitId"],
            resultBytes=result_bytes,
            deliveryBytes=delivery_bytes,
            authorityBytes=review_json(authority).encode(),
        ),
        wait,
        authority,
    )


def test_review_result_waits_replay_and_resume_after_database_reopen(tmp_path):
    async def run():
        payload, wait, authority = delivery_fixture()
        job_id = UUID(wait["request"]["engineJobId"])
        url = f"sqlite+aiosqlite:///{tmp_path / 'review.db'}"
        engine, scope = open_session(url)
        async with engine.begin() as connection:
            await connection.run_sync(SQLModel.metadata.create_all)
        async with scope() as session:
            session.add(Job(job_id=job_id, flow_id=FLOW_ID, status=JobStatus.SUSPENDED, type=JobType.WORKFLOW))
            add_checkpoint(session, job_id, "graph", review_json({
                "external_waits": {wait["waitId"]: review_json(wait)},
            }))

        async def authorize(_session, binding):
            assert binding == wait["request"]
            return authority

        ledger = ReviewClassificationLedger(JobService(), open_session=scope)
        assert await ledger.read_result(
            engine_job_id=job_id,
            engine_request_id=wait["request"]["engineRequestId"],
        ) is None
        first = await ledger.accept(payload, authorize)
        assert await ledger.accept(payload, authorize) == first
        assert await ledger.read_result(
            engine_job_id=job_id,
            engine_request_id=wait["request"]["engineRequestId"],
        ) == payload.resultBytes
        await engine.dispose()

        reopened, scope = open_session(url)
        ledger = ReviewClassificationLedger(JobService(), open_session=scope)
        assert await ledger.pending() == [first]
        continuation = review_json({
            "engineJobId": first["engineJobId"],
            "engineRequestId": first["engineRequestId"],
            "decisionId": None,
            "signalId": first["signalId"],
            "enqueueObligationId": first["enqueueObligationId"],
        })
        async with scope() as session:
            add_checkpoint(
                session,
                job_id,
                f"trellis-continuation-v1:{first['enqueueObligationId']}",
                continuation,
            )
        await ledger.mark_consumed(first, continuation.encode())
        await ledger.mark_consumed(first, continuation.encode())
        assert await ledger.pending() == []
        async with scope() as session:
            assert len((await session.exec(select(ExecutionSignal))).all()) == 1
        await reopened.dispose()

    asyncio.run(run())


def test_review_result_rejects_claimed_and_changed_replay(tmp_path):
    async def run():
        payload, wait, authority = delivery_fixture()
        job_id = UUID(wait["request"]["engineJobId"])
        url = f"sqlite+aiosqlite:///{tmp_path / 'review-replay.db'}"
        engine, scope = open_session(url)
        async with engine.begin() as connection:
            await connection.run_sync(SQLModel.metadata.create_all)
        async with scope() as session:
            session.add(Job(job_id=job_id, flow_id=FLOW_ID, status=JobStatus.SUSPENDED, type=JobType.WORKFLOW))
            add_checkpoint(session, job_id, "graph", review_json({
                "external_waits": {wait["waitId"]: review_json(wait)},
            }))

        async def authorize(_session, _binding):
            return authority

        ledger = ReviewClassificationLedger(JobService(), open_session=scope)
        await ledger.accept(payload, authorize)
        changed = ReviewDeliveryInput(
            engineWaitId=payload.engineWaitId,
            resultBytes=payload.resultBytes.replace(b'"frontend":true', b'"frontend":false'),
            deliveryBytes=payload.deliveryBytes,
            authorityBytes=payload.authorityBytes,
        )
        with pytest.raises(ReviewConflict):
            await ledger.accept(changed, authorize)
        claimed = json.loads(payload.resultBytes)
        claimed["result"] = {**claimed["result"], "state": "claimed", "relevance": None, "error": None}
        claimed_bytes = review_json(claimed).encode()
        with pytest.raises(ReviewConflict, match="review_result_not_terminal"):
            await ledger.accept(
                ReviewDeliveryInput(
                    engineWaitId=payload.engineWaitId,
                    resultBytes=claimed_bytes,
                    deliveryBytes=payload.deliveryBytes,
                    authorityBytes=payload.authorityBytes,
                ),
                authorize,
            )
        await engine.dispose()

    asyncio.run(run())


def test_cancellation_wins_before_review_acceptance(tmp_path):
    async def run():
        payload, wait, authority = delivery_fixture()
        job_id = UUID(wait["request"]["engineJobId"])
        url = f"sqlite+aiosqlite:///{tmp_path / 'review-cancel.db'}"
        engine, scope = open_session(url)
        async with engine.begin() as connection:
            await connection.run_sync(SQLModel.metadata.create_all)
        async with scope() as session:
            session.add(Job(job_id=job_id, flow_id=FLOW_ID, status=JobStatus.SUSPENDED, type=JobType.WORKFLOW))
            add_checkpoint(session, job_id, "graph", review_json({
                "external_waits": {wait["waitId"]: review_json(wait)},
            }))
            add_checkpoint(session, job_id, "trellis-cancellation-v1", review_json({
                "requestBytes": "{}",
                "receipt": {
                    "version": 1,
                    "receiptId": "00000000-0000-4000-8000-000000000021",
                    "requestId": "00000000-0000-4000-8000-000000000022",
                    "executionId": wait["request"]["executionId"],
                    "engineJobId": str(job_id),
                    "cancelIntentDigest": "0" * 64,
                    "acceptedAt": "2026-09-29T06:30:00Z",
                },
            }))

        async def authorize(_session, _binding):
            return authority

        ledger = ReviewClassificationLedger(JobService(), open_session=scope)
        with pytest.raises(CancellationConflict, match="execution_cancelled"):
            await ledger.accept(payload, authorize)
        async with scope() as session:
            assert (await session.exec(select(ExecutionSignal))).all() == []
            checkpoints = (await session.exec(select(JobCheckpoint))).all()
            assert not any(row.kind.startswith("trellis-review-acceptance-v1:") for row in checkpoints)
        await engine.dispose()

    asyncio.run(run())
