from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from sqlmodel import SQLModel, select

from integrations.langflow.tests.decisions.decision_probe import (
    CHECKPOINT_FIXTURE,
    FLOW_ID,
    JOB_ID,
    decision,
    decision_bytes,
    human_wait,
    open_session,
)

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
TRELLIS_669_ROOT = Path(os.environ["TRELLIS_669_ROOT"]).resolve()
sys.path.insert(0, str(SOURCE_ROOT / "src" / "backend"))
sys.path.insert(0, str(TRELLIS_669_ROOT))

pytest_plugins = ["tests.unit.background_execution.conftest"]

from integrations.langflow.components.trellis_external_wait import TrellisExternalWaitComponent
from integrations.langflow.tests.decisions.decision_service_probe import crash, pending_receipts, service
from langflow.services.database.models.jobs.model import JobCheckpoint, JobStatus
from langflow.services.jobs.exceptions import HUMAN_INPUT_REQUIRED_EVENT
from langflow.services.jobs.service import JobService
from langflow.services.trellis_v1.decisions import (
    TrellisDecisionAcceptance,
    TrellisDecisionEnqueueObligation,
)
from lfx.components.input_output import ChatOutput
from lfx.graph import Graph
from lfx.graph.external_wait import ExternalWaitPending
from lfx.services.durable.sqlite_checkpoints import SqliteCheckpointStore

def _graph(store: SqliteCheckpointStore, wait_bytes: str) -> Graph:
    wait = TrellisExternalWaitComponent(_id="human-wait")
    wait.set(wait_bytes=wait_bytes)
    successor = ChatOutput(_id="successor")
    successor.set(input_value=wait.wait, should_store_message=False)
    graph = Graph(wait, successor)
    graph.set_run_id(str(JOB_ID))
    graph.job_id = str(JOB_ID)
    graph.checkpointing_enabled = True
    graph.checkpoint_store = store
    return graph


@pytest.mark.real_services
async def test_accepted_decision_survives_every_service_fault_and_runs_one_successor(
    tmp_path: Path,
    real_services_db_url: str,
    real_services_job_service: JobService,
) -> None:
    assert hashlib.sha256(CHECKPOINT_FIXTURE.read_bytes()).hexdigest() == (
        "37bab5d39fa9a85ba0ec1c9c381e8386dd75debb9770db7257bfdc7f126ec65d"
    )
    assert hashlib.sha256(decision_bytes()).hexdigest() == (
        "dcf169b7f9dd00e968f9e54c0c6799f724e97a36cac9046ba5b5834cccf60e3c"
    )
    saved_decision = decision()
    wait = human_wait()
    request_id = wait["request"]["engineRequestId"]
    assert wait["waitId"] == "human-wait-1"
    assert request_id == "human-request-1"
    assert wait["waitId"] != request_id

    graph_store_path = tmp_path / "graph-checkpoints.db"
    dispatch_log_path = tmp_path / "dispatches.txt"
    graph_store = SqliteCheckpointStore(graph_store_path)
    wait_bytes = json.dumps(wait, separators=(",", ":"))
    graph = _graph(graph_store, wait_bytes)

    async def pending(_graph: Graph, _wait_bytes: str) -> None:
        return None

    graph.external_wait_handler = pending
    with pytest.raises(ExternalWaitPending):
        await graph.process(fallback_to_env_vars=False)
    checkpoint = await graph_store.load_by_run_id(str(JOB_ID))
    assert checkpoint is not None
    assert checkpoint.external_waits == {"human-wait-1": wait_bytes}

    await real_services_job_service.create_job(
        job_id=JOB_ID,
        flow_id=FLOW_ID,
        user_id=uuid4(),
        initial_metadata={
            "request": {
                "flow_id": str(FLOW_ID),
                "input_value": "",
                "mode": "background",
                "stream_protocol": "langflow",
            }
        },
    )
    await real_services_job_service.update_job_status(JOB_ID, JobStatus.IN_PROGRESS)
    await real_services_job_service.save_checkpoint(JOB_ID, "graph", checkpoint.model_dump_json())
    await real_services_job_service.append_event(
        JOB_ID,
        HUMAN_INPUT_REQUIRED_EVENT,
        {"request_id": request_id, "trellis_wait_v1": wait["request"]},
    )
    await real_services_job_service.suspend_job(JOB_ID, {"external_wait_ids": [wait["waitId"]]})

    engine, session_scope = open_session(real_services_db_url)
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)

    crash(real_services_db_url, graph_store_path, dispatch_log_path, "after_acceptance_commit", 91)

    background = service(real_services_db_url, str(graph_store_path), str(dispatch_log_path))
    lookup = await background.lookup_trellis_human_decision(
        execution_id=saved_decision["wait"]["executionId"],
        engine_job_id=JOB_ID,
        engine_request_id=request_id,
        decision_id=saved_decision["decisionId"],
        payload_digest=hashlib.sha256(decision_bytes()).hexdigest(),
    )
    assert lookup["state"] == "accepted"
    receipt = lookup["receipt"]
    assert await pending_receipts() == [receipt]

    crash(real_services_db_url, graph_store_path, dispatch_log_path, "before_continuation_receipt", 92)
    assert await pending_receipts() == [receipt]

    crash(real_services_db_url, graph_store_path, dispatch_log_path, "after_queue_lease_before_submit", 93)
    assert await pending_receipts() == [receipt]
    leased_job = await real_services_job_service.get_job_by_job_id(JOB_ID)
    assert leased_job is not None
    assert leased_job.status == JobStatus.QUEUED
    assert real_services_job_service.is_lease_stale(leased_job, lease_ttl_s=5.0) is False
    leased_checkpoint = await SqliteCheckpointStore(graph_store_path).load_by_run_id(str(JOB_ID))
    assert leased_checkpoint is not None
    assert leased_checkpoint.external_waits == {"human-wait-1": wait_bytes}

    crash(real_services_db_url, graph_store_path, dispatch_log_path, "after_dispatch_before_mark", 94)
    assert await pending_receipts() == [receipt]
    assert (await real_services_job_service.get_job_by_job_id(JOB_ID)).status == JobStatus.COMPLETED

    completed_store = SqliteCheckpointStore(graph_store_path)
    completed_checkpoint = await completed_store.load_by_run_id(str(JOB_ID))
    assert completed_checkpoint is not None
    resumed = Graph.resume_from_checkpoint(completed_checkpoint, checkpoint_store=completed_store)
    wait_vertex = resumed.get_vertex("human-wait")
    successor = resumed.get_vertex("successor")
    assert json.loads(wait_vertex.results["receipt"].text) == saved_decision
    assert successor.built is True
    assert json.loads(successor.results["message"].text) == saved_decision
    assert resumed._call_order.count("successor") == 1
    assert completed_checkpoint.external_waits == {}

    crash(real_services_db_url, graph_store_path, dispatch_log_path, "after_obligation_mark", 95)
    assert await pending_receipts() == []

    payload = decision_bytes()
    replay = await background.accept_trellis_human_decision(
        engine_job_id=JOB_ID,
        decision_bytes=payload,
        payload_digest=hashlib.sha256(payload).hexdigest(),
    )
    assert replay == receipt
    await background.sweep_orphans_on_startup()
    await asyncio.sleep(0.05)
    assert dispatch_log_path.read_text(encoding="utf-8").splitlines() == [request_id]

    async with session_scope() as session:
        acceptance = (await session.exec(select(TrellisDecisionAcceptance))).one()
        obligation = (await session.exec(select(TrellisDecisionEnqueueObligation))).one()
        continuation = (
            await session.exec(
                select(JobCheckpoint).where(
                    JobCheckpoint.kind == f"trellis-continuation-v1:{receipt['enqueueObligationId']}"
                )
            )
        ).one()
    assert json.loads(acceptance.receipt_bytes) == receipt
    assert obligation.consumed_at is not None
    assert obligation.continuation_receipt_bytes == continuation.blob.encode()
    assert json.loads(continuation.blob)["engineRequestId"] == request_id
    assert await real_services_job_service.unconsumed_signals(JOB_ID) == []
    await background.stop()
    await engine.dispose()
