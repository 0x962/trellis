from __future__ import annotations

import asyncio
import json
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlmodel import select

from integrations.langflow.tests.decisions.authority_probe import stored_authority
from integrations.langflow.tests.decisions.decision_probe import (
    JOB_ID,
    decision_bytes,
    digest,
    open_session,
)
from integrations.langflow.tests.decisions.test_decision_acceptance import _accept, _initialize
from langflow.services.database.models.jobs.model import ExecutionSignal, JobCheckpoint
from langflow.services.trellis_v1.decisions import (
    DecisionAcceptanceLedger,
    DecisionConflictError,
    TrellisDecisionAcceptance,
    TrellisDecisionEnqueueObligation,
)


def test_enqueue_obligation_stays_pending_until_continuation_confirms(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'enqueue-obligation.db'}"
    asyncio.run(_initialize(database_url))
    receipt = asyncio.run(_accept(database_url))
    continuation_receipt_bytes = json.dumps(
        {
            "version": 1,
            "engineJobId": receipt["engineJobId"],
            "engineRequestId": receipt["engineRequestId"],
            "decisionId": receipt["decisionId"],
            "signalId": receipt["signalId"],
            "enqueueObligationId": receipt["enqueueObligationId"],
            "queuedAt": "2026-09-29T06:00:01+00:00",
            "queueClaimed": True,
        },
        separators=(",", ":"),
    ).encode()

    async def run() -> tuple[list[dict], list[dict], dict, bytes | None]:
        engine, session_scope = open_session(database_url)
        ledger = DecisionAcceptanceLedger(open_session=session_scope)
        before = await ledger.pending_enqueue_obligations()
        async with session_scope() as session:
            signal = (await session.exec(select(ExecutionSignal))).one()
            signal_data = signal.data
            assert signal_data is not None
            session.add(
                JobCheckpoint(
                    job_id=JOB_ID,
                    kind=f"trellis-continuation-v1:{receipt['enqueueObligationId']}",
                    blob=continuation_receipt_bytes.decode(),
                )
            )
        mark = {
            "engine_job_id": JOB_ID,
            "engine_request_id": receipt["engineRequestId"],
            "decision_id": receipt["decisionId"],
            "signal_id": UUID(receipt["signalId"]),
            "enqueue_obligation_id": UUID(receipt["enqueueObligationId"]),
        }
        with pytest.raises(DecisionConflictError):
            await ledger.mark_enqueue_obligation_consumed(**mark, continuation_receipt_bytes=b"{}")
        await ledger.mark_enqueue_obligation_consumed(
            **mark,
            continuation_receipt_bytes=continuation_receipt_bytes,
        )
        await ledger.mark_enqueue_obligation_consumed(
            **mark,
            continuation_receipt_bytes=continuation_receipt_bytes,
        )
        with pytest.raises(DecisionConflictError):
            await ledger.mark_enqueue_obligation_consumed(
                **mark,
                continuation_receipt_bytes=continuation_receipt_bytes + b"x",
            )
        for field, value in (
            ("engine_job_id", uuid4()),
            ("engine_request_id", "human-request-2"),
            ("decision_id", "decision-2"),
            ("signal_id", uuid4()),
            ("enqueue_obligation_id", uuid4()),
        ):
            with pytest.raises(DecisionConflictError):
                await ledger.mark_enqueue_obligation_consumed(
                    **(mark | {field: value}),
                    continuation_receipt_bytes=continuation_receipt_bytes,
                )
        after = await ledger.pending_enqueue_obligations()
        async with session_scope() as session:
            obligation = await session.get(
                TrellisDecisionEnqueueObligation,
                UUID(receipt["enqueueObligationId"]),
            )
            assert obligation is not None
            saved_continuation = obligation.continuation_receipt_bytes
        await engine.dispose()
        return before, after, signal_data, saved_continuation

    before, after, signal_data, saved_continuation = asyncio.run(run())
    assert before == [receipt]
    assert after == []
    assert saved_continuation == continuation_receipt_bytes
    assert set(signal_data) == {"kind", "engineRequestId", "decisionId", "enqueueObligationId", "decision"}
    assert signal_data["kind"] == "trellis_human_decision_v1"
    assert signal_data["engineRequestId"] == "human-request-1"
    assert signal_data["decisionId"] == "decision-1"
    assert signal_data["enqueueObligationId"] == receipt["enqueueObligationId"]
    assert signal_data["decision"] == json.loads(decision_bytes())


def test_valid_large_output_and_round_values_remain_exact(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'large-values.db'}"
    decision = json.loads(decision_bytes())
    decision["wait"]["occurrence"]["iterationPath"][0]["round"] = 51
    decision["output"] = "x" * 1_100_000
    payload = json.dumps(decision, separators=(",", ":")).encode()
    asyncio.run(_initialize(database_url, payload))

    async def run() -> tuple[dict, bytes]:
        engine, session_scope = open_session(database_url)
        ledger = DecisionAcceptanceLedger(open_session=session_scope)
        receipt = await ledger.accept(
            engine_job_id=JOB_ID,
            decision_bytes=payload,
            payload_digest=digest(payload),
            authority_bytes=await stored_authority(database_url),
        )
        async with session_scope() as session:
            acceptance = await session.get(TrellisDecisionAcceptance, "decision-1")
            assert acceptance is not None
            stored = acceptance.decision_bytes
        await engine.dispose()
        return receipt, stored

    receipt, stored = asyncio.run(run())
    assert receipt["payloadDigest"] == digest(payload)
    assert stored == payload
