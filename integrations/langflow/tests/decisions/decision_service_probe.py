from __future__ import annotations

import asyncio
import hashlib
import multiprocessing
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest

from integrations.langflow.tests.decisions.decision_probe import JOB_ID, decision_bytes
from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.database.factory import DatabaseServiceFactory
from langflow.services.database.models.jobs.model import JobStatus
from langflow.services.deps import get_job_service, get_settings_service
from langflow.services.jobs.service import JobService
from langflow.services.trellis_v1.decisions import DecisionAcceptanceLedger
from lfx.graph.checkpoint.resume import resume_graph_with_decision
from lfx.services.durable.sqlite_checkpoints import SqliteCheckpointStore
from lfx.services.manager import get_service_manager
from lfx.services.schema import ServiceType


def _bind_database(database_url: str) -> None:
    manager = get_service_manager()
    settings_service = get_settings_service()
    settings_service.settings.database_url = database_url
    manager.services.pop(ServiceType.DATABASE_SERVICE, None)
    manager.services[ServiceType.DATABASE_SERVICE] = DatabaseServiceFactory().create(settings_service)


def service(database_url: str, graph_store_path: str, dispatch_log_path: str) -> BackgroundExecutionService:
    _bind_database(database_url)
    settings = get_settings_service().settings.model_copy(
        update={
            "background_input_deadline_s": None,
            "background_lease_ttl_s": 5.0,
            "background_max_concurrency": 1,
            "job_queue_type": "asyncio",
        }
    )

    def frame_source_factory(**_factory_kwargs):
        async def source(*, resume=None, **_source_kwargs):
            assert resume is not None
            with Path(dispatch_log_path).open("a", encoding="utf-8") as log:
                log.write(f"{resume['request_id']}\n")
            store = SqliteCheckpointStore(Path(graph_store_path))
            checkpoint = await store.load_by_run_id(str(JOB_ID))
            assert checkpoint is not None
            graph = resume_graph_with_decision(
                checkpoint,
                store,
                resume["request_id"],
                resume["decision"],
            )
            await graph.process(fallback_to_env_vars=False)
            if False:
                yield b"", "output"

        return source

    return BackgroundExecutionService(
        settings_service=SimpleNamespace(settings=settings),
        frame_source_factory=frame_source_factory,
    )


async def _wait_for_status(status: JobStatus) -> None:
    for _ in range(300):
        job = await get_job_service().get_job_by_job_id(JOB_ID)
        assert job is not None
        if job.status == status:
            return
        assert job.status != JobStatus.FAILED
        await asyncio.sleep(0.01)
    raise AssertionError(f"The job did not reach {status.value}.")


async def _fault_process(
    database_url: str,
    graph_store_path: str,
    dispatch_log_path: str,
    fault_point: str,
) -> None:
    background = service(database_url, graph_store_path, dispatch_log_path)

    if fault_point == "after_acceptance_commit":
        original_accept = DecisionAcceptanceLedger.accept

        async def accept_then_exit(self, **kwargs):
            await original_accept(self, **kwargs)
            os._exit(91)

        DecisionAcceptanceLedger.accept = accept_then_exit
        payload = decision_bytes()
        await background.accept_trellis_human_decision(
            engine_job_id=JOB_ID,
            decision_bytes=payload,
            payload_digest=hashlib.sha256(payload).hexdigest(),
        )

    if fault_point == "before_continuation_receipt":

        async def exit_before_receipt(self, **kwargs):
            os._exit(92)

        JobService.consume_suspended_continuation = exit_before_receipt

    if fault_point == "after_queue_lease_before_submit":

        async def exit_after_lease(**_kwargs) -> None:
            os._exit(93)

        background._enqueue = exit_after_lease

    if fault_point == "after_dispatch_before_mark":

        async def exit_before_mark(self, **_kwargs) -> None:
            await _wait_for_status(JobStatus.COMPLETED)
            os._exit(94)

        DecisionAcceptanceLedger.mark_enqueue_obligation_consumed = exit_before_mark

    if fault_point == "after_obligation_mark":
        original_mark = DecisionAcceptanceLedger.mark_enqueue_obligation_consumed

        async def mark_then_exit(self, **kwargs) -> None:
            await original_mark(self, **kwargs)
            os._exit(95)

        DecisionAcceptanceLedger.mark_enqueue_obligation_consumed = mark_then_exit

    await background.sweep_orphans_on_startup()
    if fault_point == "after_dispatch_before_mark":
        await asyncio.sleep(10)
    raise AssertionError(f"The process did not reach {fault_point}.")


def _run_fault(
    database_url: str,
    graph_store_path: str,
    dispatch_log_path: str,
    fault_point: str,
) -> None:
    asyncio.run(_fault_process(database_url, graph_store_path, dispatch_log_path, fault_point))


def crash(
    database_url: str,
    graph_store_path: Path,
    dispatch_log_path: Path,
    fault_point: str,
    expected_exit: int,
) -> None:
    process = multiprocessing.get_context("spawn").Process(
        target=_run_fault,
        args=(database_url, str(graph_store_path), str(dispatch_log_path), fault_point),
    )
    process.start()
    process.join(30)
    if process.is_alive():
        process.kill()
        process.join()
        pytest.fail(f"The {fault_point} process did not reach its fault point.")
    assert process.exitcode == expected_exit


async def pending_receipts() -> list[dict]:
    return await DecisionAcceptanceLedger().pending_enqueue_obligations()
