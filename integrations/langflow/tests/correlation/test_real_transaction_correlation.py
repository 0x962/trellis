from __future__ import annotations

import json
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from lfx.graph.checkpoint.schema import GraphCheckpoint
from lfx.graph.graph.base import Graph
from langflow.services.background_execution.runner import JobRunner
from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.database.models.jobs.model import JobStatus
from langflow.services.trellis_v1.correlation import (
    AdmissionContinuation,
    AdmissionPending,
    CorrelationCoordinator,
    JobServiceCorrelationStore,
    ProtocolConflict,
)
from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker

from correlation_fixture_support import (
    CONTINUATION,
    JOB_ID,
    KEY,
    RETRY_JOB_ID,
    admission_wait_bytes,
    contract_bytes,
    correlation_variant,
    reserved_submission_bytes,
)
from real_transaction_fixture_support import (
    BackgroundHarness,
    GraphHarness,
    LiveBus,
    assert_patched_imports,
    create_correlation_table,
    real_services_job_service,
    row_counts,
)

pytest_plugins = ["tests.unit.background_execution.conftest"]


def test_imports_resolve_to_the_patched_pin() -> None:
    assert_patched_imports(
        BackgroundExecutionService,
        Graph,
        JobRunner,
        JobServiceCorrelationStore,
        TrellisExternalWaitBroker,
    )


@pytest.mark.real_services
@pytest.mark.parametrize(
    "terminal_state",
    [
        JobStatus.COMPLETED,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
        JobStatus.TIMED_OUT,
    ],
)
async def test_lost_response_keeps_one_job_and_suspends_before_native_work(
    real_services_job_service,
    real_services_db_url: str,
    terminal_state: JobStatus,
) -> None:
    if not real_services_db_url.startswith("sqlite"):
        pytest.skip("This serial fixture uses its private SQLite database.")
    await create_correlation_table()
    flow_id = uuid4()
    user_id = uuid4()
    submission_bytes = reserved_submission_bytes()
    correlation_bytes = contract_bytes("correlation")
    store = JobServiceCorrelationStore(
        real_services_job_service,
        flow_id=flow_id,
        user_id=user_id,
    )
    coordinator = CorrelationCoordinator(store)
    first_receipt = await coordinator.accept_submission(
        submission_bytes,
        job_id=JOB_ID,
        correlation_receipt_bytes=correlation_bytes,
    )
    duplicate_before_response = await coordinator.accept_submission(
        submission_bytes,
        job_id=RETRY_JOB_ID,
        correlation_receipt_bytes=correlation_bytes,
    )
    assert first_receipt == duplicate_before_response == correlation_bytes
    assert await row_counts() == (1, 1)

    engine_key_submission, engine_key_correlation = correlation_variant(
        request_id=UUID("00000000-0000-4000-8000-000000000013"),
        execution_id="execution-1",
        job_id=RETRY_JOB_ID,
        engine_session_id="execution-session-2",
    )
    with pytest.raises(
        ProtocolConflict,
        match="engine_correlation_identity_conflict",
    ):
        await coordinator.accept_submission(
            engine_key_submission,
            job_id=RETRY_JOB_ID,
            correlation_receipt_bytes=engine_key_correlation,
        )
    engine_session_submission, engine_session_correlation = correlation_variant(
        request_id=UUID("00000000-0000-4000-8000-000000000014"),
        execution_id="execution-2",
        job_id=RETRY_JOB_ID,
        engine_session_id="execution-session-1",
    )
    with pytest.raises(
        ProtocolConflict,
        match="engine_correlation_identity_conflict",
    ):
        await coordinator.accept_submission(
            engine_session_submission,
            job_id=RETRY_JOB_ID,
            correlation_receipt_bytes=engine_session_correlation,
        )
    assert await row_counts() == (1, 1)

    graph = GraphHarness(real_services_job_service, JOB_ID)
    native_effects = 0

    async def frame_source(**_kwargs):
        nonlocal native_effects
        try:
            admission_receipt = await coordinator.admission_or_wait(
                KEY,
                admission_wait_bytes(),
            )
        except AdmissionPending as pending:
            await graph.await_external_completion(
                pending.external_wait_bytes.decode("utf-8")
            )
        else:
            await graph.complete_external_wait(
                admission_wait_bytes().decode("utf-8"),
                admission_receipt.decode("utf-8"),
            )
        native_effects += 1
        if False:
            yield b"", "unused"

    runner = JobRunner(
        job_service=real_services_job_service,
        live_bus=LiveBus(),
        adapter=SimpleNamespace(),
        frame_source=frame_source,
        job_timeout=None,
        input_deadline_s=None,
    )
    await runner.run(job_id=JOB_ID, source_kwargs={})
    suspended = await real_services_job_service.get_job_by_job_id(JOB_ID)
    assert suspended is not None
    assert suspended.status == JobStatus.SUSPENDED
    assert suspended.job_metadata is not None
    assert suspended.job_metadata["external_wait_ids"] == ["admission-wait-1"]
    assert "input_deadline_at" not in suspended.job_metadata
    assert native_effects == 0
    checkpoint = GraphCheckpoint.model_validate_json(
        await real_services_job_service.load_checkpoint(JOB_ID, "graph")
    )
    assert checkpoint.external_waits == {
        "admission-wait-1": admission_wait_bytes().decode("utf-8")
    }

    recovered = CorrelationCoordinator(
        JobServiceCorrelationStore(
            real_services_job_service,
            flow_id=flow_id,
            user_id=user_id,
        )
    )
    assert await recovered.accept_submission(
        submission_bytes,
        job_id=RETRY_JOB_ID,
        correlation_receipt_bytes=correlation_bytes,
    ) == contract_bytes("correlation")
    admission_commit = await recovered.open_admission(
        KEY,
        contract_bytes("admission"),
        CONTINUATION,
    )
    continuation_receipt = json.loads(admission_commit.continuation_receipt_bytes)
    assert continuation_receipt["engineJobId"] == str(JOB_ID)
    assert continuation_receipt["engineRequestId"] == "admission-wait-1"
    assert continuation_receipt["signalId"] == str(CONTINUATION.signal_id)
    assert continuation_receipt["enqueueObligationId"] == str(
        CONTINUATION.enqueue_obligation_id
    )
    assert continuation_receipt["queueClaimed"] is True
    pending = await real_services_job_service.pending_trellis_admission_obligations()
    assert len(pending) == 1
    assert pending[0].engine_job_id == JOB_ID
    assert pending[0].engine_request_id == CONTINUATION.engine_request_id
    assert pending[0].signal_id == CONTINUATION.signal_id
    assert pending[0].enqueue_obligation_id == CONTINUATION.enqueue_obligation_id
    assert (
        pending[0].continuation_receipt_bytes
        == admission_commit.continuation_receipt_bytes
    )
    assert (
        await recovered.open_admission(
            KEY,
            contract_bytes("admission"),
            CONTINUATION,
        )
        == admission_commit
    )
    with pytest.raises(
        ProtocolConflict,
        match="admission_continuation_identity_conflict",
    ):
        await recovered.open_admission(
            KEY,
            contract_bytes("admission"),
            AdmissionContinuation(
                engine_request_id=CONTINUATION.engine_request_id,
                signal_id=uuid4(),
                enqueue_obligation_id=CONTINUATION.enqueue_obligation_id,
            ),
        )

    background = BackgroundHarness()
    disposition = await background._enqueue_queued_continuation(
        engine_job_id=JOB_ID,
        enqueue_obligation_id=CONTINUATION.enqueue_obligation_id,
        continuation_receipt_bytes=admission_commit.continuation_receipt_bytes,
    )
    assert disposition == "dispatched"
    assert background.enqueued == [JOB_ID]
    await real_services_job_service.mark_trellis_admission_obligation_consumed(
        engine_job_id=JOB_ID,
        engine_request_id=CONTINUATION.engine_request_id,
        signal_id=CONTINUATION.signal_id,
        enqueue_obligation_id=CONTINUATION.enqueue_obligation_id,
        continuation_receipt_bytes=admission_commit.continuation_receipt_bytes,
    )
    assert await real_services_job_service.pending_trellis_admission_obligations() == []
    await runner.run(job_id=JOB_ID, source_kwargs={})
    assert native_effects == 1
    resumed_checkpoint = GraphCheckpoint.model_validate_json(
        await real_services_job_service.load_checkpoint(JOB_ID, "graph")
    )
    assert resumed_checkpoint.external_waits == {}
    assert await real_services_job_service.unconsumed_signals(JOB_ID) == []

    await real_services_job_service.update_job_status(JOB_ID, terminal_state)
    assert (
        await recovered.accept_submission(
            submission_bytes,
            job_id=RETRY_JOB_ID,
            correlation_receipt_bytes=correlation_bytes,
        )
        == correlation_bytes
    )
    terminal_lookup = await store.lookup(KEY)
    assert terminal_lookup.record is not None
    assert terminal_lookup.record.terminal_state == terminal_state.value
    assert await row_counts() == (1, 1)
