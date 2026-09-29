from __future__ import annotations

import asyncio
import hashlib
import json
import os
from pathlib import Path

import pytest

from lfx.graph.checkpoint.schema import GraphCheckpoint
from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.database.models.jobs.model import JobStatus
from langflow.services.deps import get_job_service
from langflow.services.trellis_v1.correlation import AdmissionPending

from correlation_fixture_support import (
    CONTINUATION,
    JOB_ID,
    KEY,
    RETRY_JOB_ID,
    admission_wait_bytes,
    contract_bytes,
    reserved_submission_bytes,
)
from failure_boundary_fixture_support import (
    commit_fake_native_admission,
    create_failure_boundary_tables,
    mark_fake_native_admission_acknowledged,
    pending_fake_native_admissions,
)
from real_transaction_fixture_support import (
    GraphHarness,
    background_service,
    configure_child_database,
    correlation_coordinator,
    row_counts,
    terminate_child,
    wait_for_status,
)

pytest_plugins = ["tests.unit.background_execution.conftest"]


async def _frame_source_factory(job_service, coordinator):
    checkpoint = GraphCheckpoint.model_validate_json(
        await job_service.load_checkpoint(JOB_ID, "graph")
    )
    graph = GraphHarness(job_service, JOB_ID)
    graph.external_waits = dict(checkpoint.external_waits)

    async def frame_source(**_kwargs):
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
        marker = Path(os.environ["TRL668_RUN_ROOT"]) / "native-effect.json"
        with marker.open("x") as output:
            json.dump(
                {
                    "engineJobId": str(JOB_ID),
                    "admissionReceiptSha256": hashlib.sha256(
                        admission_receipt
                    ).hexdigest(),
                },
                output,
            )
        if False:
            yield b"", "unused"

    return lambda **_kwargs: frame_source


async def _suspend_at_admission(job_service, coordinator) -> None:
    from langflow.services.background_execution.runner import JobRunner

    graph = GraphHarness(job_service, JOB_ID)

    async def frame_source(**_kwargs):
        try:
            await coordinator.admission_or_wait(KEY, admission_wait_bytes())
        except AdmissionPending as pending:
            await graph.await_external_completion(
                pending.external_wait_bytes.decode("utf-8")
            )
        if False:
            yield b"", "unused"

    await JobRunner(
        job_service=job_service,
        live_bus=type("LiveBus", (), {"close": lambda *_args: asyncio.sleep(0)})(),
        adapter=object(),
        frame_source=frame_source,
        job_timeout=None,
        input_deadline_s=None,
    ).run(job_id=JOB_ID, source_kwargs={})


async def _child_boundary() -> None:
    await configure_child_database()
    await create_failure_boundary_tables()
    job_service = get_job_service()
    coordinator = correlation_coordinator(job_service)
    phase = os.environ["TRL668_CHILD_PHASE"]
    if phase == "engine_before_submission_commit":
        os._exit(90)
    if phase == "engine_after_submission_commit":
        await coordinator.accept_submission(
            reserved_submission_bytes(),
            job_id=JOB_ID,
            correlation_receipt_bytes=contract_bytes("correlation"),
        )
        os._exit(91)
    if phase == "engine_before_wait_commit":
        os._exit(92)
    if phase == "engine_after_wait_commit":
        await _suspend_at_admission(job_service, coordinator)
        os._exit(93)
    if phase == "native_before_admission_commit":
        os._exit(94)
    if phase == "native_after_admission_commit":
        await commit_fake_native_admission()
        os._exit(95)
    if phase == "engine_before_admission_commit":
        os._exit(96)
    if phase == "engine_after_admission_commit":
        await coordinator.open_admission(
            KEY,
            contract_bytes("admission"),
            CONTINUATION,
        )
        os._exit(97)
    if phase == "native_before_acknowledgement":
        await coordinator.open_admission(
            KEY,
            contract_bytes("admission"),
            CONTINUATION,
        )
        os._exit(98)
    if phase == "engine_after_dispatch_before_mark":

        async def terminate_before_mark(**_kwargs) -> None:
            os._exit(99)

        job_service.mark_trellis_admission_obligation_consumed = terminate_before_mark
        factory = await _frame_source_factory(job_service, coordinator)
        service = background_service(factory)
        await service.start()
        await asyncio.sleep(10)
        raise AssertionError("dispatch boundary did not terminate")
    if phase == "native_after_acknowledgement":
        await mark_fake_native_admission_acknowledged(
            execution_id="execution-1",
            engine_job_id=JOB_ID,
            admission_receipt_bytes=contract_bytes("admission"),
        )
        os._exit(100)
    raise AssertionError(phase)


@pytest.mark.real_services
async def test_service_deaths_recover_one_admitted_native_effect(
    real_services_job_service,
    real_services_db_url: str,
) -> None:
    if not real_services_db_url.startswith("sqlite"):
        pytest.skip("This process-loss fixture uses its private SQLite database.")
    await create_failure_boundary_tables()
    child = Path(__file__)
    boundaries = [
        ("engine_before_submission_commit", 90),
        ("engine_after_submission_commit", 91),
        ("engine_before_wait_commit", 92),
        ("engine_after_wait_commit", 93),
        ("native_before_admission_commit", 94),
        ("native_after_admission_commit", 95),
        ("engine_before_admission_commit", 96),
        ("engine_after_admission_commit", 97),
        ("native_before_acknowledgement", 98),
        ("engine_after_dispatch_before_mark", 99),
    ]
    for phase, exit_code in boundaries:
        terminate_child(phase, real_services_db_url, exit_code, child)

    assert await row_counts() == (1, 1)
    pending_native = await pending_fake_native_admissions()
    assert len(pending_native) == 1
    pending_engine = (
        await real_services_job_service.pending_trellis_admission_obligations()
    )
    assert len(pending_engine) == 1

    coordinator = correlation_coordinator(real_services_job_service)
    assert await coordinator.accept_submission(
        reserved_submission_bytes(),
        job_id=RETRY_JOB_ID,
        correlation_receipt_bytes=contract_bytes("correlation"),
    ) == contract_bytes("correlation")
    factory = await _frame_source_factory(real_services_job_service, coordinator)
    service = background_service(factory)
    await service.start()
    try:
        await wait_for_status(real_services_job_service, JobStatus.COMPLETED)
    finally:
        await service.stop()
    assert Path(os.environ["TRL668_RUN_ROOT"], "native-effect.json").is_file()
    assert await real_services_job_service.pending_trellis_admission_obligations() == []

    terminate_child("native_after_acknowledgement", real_services_db_url, 100, child)
    assert await pending_fake_native_admissions() == []
    trace = {
        "boundaries": [phase for phase, _exit_code in boundaries],
        "correlationReceiptSha256": hashlib.sha256(
            contract_bytes("correlation")
        ).hexdigest(),
        "admissionReceiptSha256": hashlib.sha256(
            contract_bytes("admission")
        ).hexdigest(),
        "engineJobId": str(JOB_ID),
        "nativeEffects": 1,
        "terminalStatus": JobStatus.COMPLETED.value,
    }
    Path(os.environ["TRL668_RUN_ROOT"], "failure-boundary-trace.json").write_text(
        json.dumps(trace, indent=2, sort_keys=True) + "\n"
    )


if __name__ == "__main__":
    asyncio.run(_child_boundary())
