from __future__ import annotations

import asyncio
import inspect
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

from sqlmodel import func, select

from lfx.graph.checkpoint.schema import GraphCheckpoint
from lfx.graph.graph.base import Graph
from langflow.services.background_execution.runner import JobRunner
from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.database.models.jobs.model import Job, JobStatus
from langflow.services.deps import get_db_service, get_settings_service, session_scope
from langflow.services.trellis_v1.correlation import (
    CorrelationCoordinator,
    JobServiceCorrelationStore,
    TrellisJobCorrelation,
)
from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker

from correlation_fixture_support import FLOW_ID, JOB_ID, USER_ID

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()


async def create_correlation_table() -> None:
    async with get_db_service().engine.begin() as connection:
        await connection.run_sync(
            TrellisJobCorrelation.__table__.create,
            checkfirst=True,
        )


class CheckpointStore:
    def __init__(self, jobs, job_id: UUID) -> None:
        self._jobs = jobs
        self._job_id = job_id

    async def save(self, checkpoint: GraphCheckpoint) -> None:
        await self._jobs.save_checkpoint(
            self._job_id,
            "graph",
            checkpoint.model_dump_json(),
        )


class GraphHarness:
    await_external_completion = Graph.await_external_completion
    complete_external_wait = Graph.complete_external_wait

    def __init__(self, jobs, job_id: UUID) -> None:
        self.job_id = str(job_id)
        self.external_waits: dict[str, str] = {}
        self.external_wait_handler = TrellisExternalWaitBroker(jobs).receipt_for
        self.checkpoint_store = CheckpointStore(jobs, job_id)
        self._external_wait_lock = asyncio.Lock()

    def build_checkpoint(self) -> GraphCheckpoint:
        return GraphCheckpoint(
            run_id=self.job_id,
            job_id=self.job_id,
            external_waits=dict(self.external_waits),
        )


class LiveBus:
    async def close(self, _job_id: str) -> None:
        return None


class BackgroundHarness:
    _enqueue_queued_continuation = (
        BackgroundExecutionService._enqueue_queued_continuation
    )

    def __init__(self) -> None:
        self._scaled = False
        self._owner = "trl-668-probe"
        self._settings = SimpleNamespace(background_lease_ttl_s=30.0)
        self.enqueued: list[UUID] = []

    @staticmethod
    def _reconstruct_request(_job):
        return SimpleNamespace()

    @staticmethod
    def _user_stub(_user_id):
        return SimpleNamespace()

    async def _enqueue(self, *, job_id: UUID, **_kwargs) -> None:
        self.enqueued.append(job_id)


async def row_counts() -> tuple[int, int]:
    async with session_scope() as session:
        jobs = (await session.exec(select(func.count()).select_from(Job))).one()
        correlations = (
            await session.exec(select(func.count()).select_from(TrellisJobCorrelation))
        ).one()
        return jobs, correlations


async def wait_for_status(job_service, status: JobStatus) -> None:
    async with asyncio.timeout(10):
        while True:
            job = await job_service.get_job_by_job_id(JOB_ID)
            if job is not None and job.status == status:
                return
            await asyncio.sleep(0.01)


def terminate_child(
    phase: str,
    database_url: str,
    expected_exit: int,
    child_path: Path,
) -> None:
    result = subprocess.run(
        [sys.executable, str(child_path.resolve())],
        check=False,
        capture_output=True,
        env={
            **os.environ,
            "TRL668_CHILD_DATABASE_URL": database_url,
            "TRL668_CHILD_PHASE": phase,
        },
    )
    assert result.returncode == expected_exit, result.stderr.decode()
    assert result.stdout == b""


async def configure_child_database():
    from langflow.services.database.factory import DatabaseServiceFactory
    from lfx.services.manager import get_service_manager
    from lfx.services.schema import ServiceType

    settings_service = get_settings_service()
    settings_service.settings.database_url = os.environ["TRL668_CHILD_DATABASE_URL"]
    database_service = DatabaseServiceFactory().create(settings_service)
    manager = get_service_manager()
    manager.services.pop(ServiceType.DATABASE_SERVICE, None)
    manager.services[ServiceType.DATABASE_SERVICE] = database_service
    await database_service.run_migrations()
    return database_service


def correlation_coordinator(job_service) -> CorrelationCoordinator:
    return CorrelationCoordinator(
        JobServiceCorrelationStore(
            job_service,
            flow_id=FLOW_ID,
            user_id=USER_ID,
        )
    )


def background_service(frame_source_factory) -> BackgroundExecutionService:
    settings = get_settings_service().settings.model_copy(
        update={
            "background_input_deadline_s": None,
            "background_job_timeout": None,
            "background_lease_ttl_s": 0.1,
        }
    )
    return BackgroundExecutionService(
        settings_service=SimpleNamespace(settings=settings),
        frame_source_factory=frame_source_factory,
    )


def assert_patched_imports(*values: object) -> None:
    for value in values:
        path = Path(inspect.getfile(value)).resolve()
        assert path.is_relative_to(SOURCE_ROOT)
