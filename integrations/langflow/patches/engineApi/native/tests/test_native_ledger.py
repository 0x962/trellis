from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from uuid import UUID

import pytest
from sqlmodel import SQLModel, select

from integrations.langflow.tests.decisions.decision_probe import FLOW_ID, open_session
from langflow.services.database.models.jobs.model import ExecutionSignal, Job, JobCheckpoint, JobStatus, JobType
from langflow.services.jobs.service import JobService
from langflow.services.trellis_v1.native_ledger import NativeCompletionLedger
from langflow.services.trellis_v1.native_protocol import serialized
from langflow.services.trellis_v1.native_records import add_checkpoint, request_kind

from test_native_protocol import fixture


def test_completion_signal_and_obligation_commit_together_and_replay_after_reopen(tmp_path):
    async def run():
        payload, wait, request_bytes, authority = fixture()
        job_id = UUID(wait["request"]["engineJobId"])
        url = f"sqlite+aiosqlite:///{tmp_path / 'native.db'}"
        engine, scope = open_session(url)
        async with engine.begin() as connection:
            await connection.run_sync(SQLModel.metadata.create_all)
        async with scope() as session:
            session.add(Job(job_id=job_id, flow_id=FLOW_ID, status=JobStatus.SUSPENDED, type=JobType.WORKFLOW))
            add_checkpoint(session, job_id, "graph", serialized({"external_waits": {wait["waitId"]: serialized(wait)}}))
            add_checkpoint(session, job_id, request_kind(wait["waitId"]), request_bytes)

        async def authorize(_binding):
            return authority

        @asynccontextmanager
        async def failed_commit():
            async with scope() as session:
                yield session
                raise RuntimeError("before_commit")

        with pytest.raises(RuntimeError, match="before_commit"):
            await NativeCompletionLedger(JobService(), open_session=failed_commit).accept(payload, authorize)
        async with scope() as session:
            assert (await session.exec(select(ExecutionSignal))).all() == []
            records = (await session.exec(select(JobCheckpoint))).all()
            assert {row.kind for row in records} == {"graph", request_kind(wait["waitId"])}
        first = await NativeCompletionLedger(JobService(), open_session=scope).accept(payload, authorize)
        await engine.dispose()
        reopened, scope = open_session(url)
        second = await NativeCompletionLedger(JobService(), open_session=scope).accept(payload, authorize)
        assert second == first
        async with scope() as session:
            assert len((await session.exec(select(ExecutionSignal))).all()) == 1
            records = (await session.exec(select(JobCheckpoint))).all()
            assert len([row for row in records if row.kind.startswith("trellis-native-obligation-v1:")]) == 1
        observed = await NativeCompletionLedger(JobService(), open_session=scope).observe(job_id, wait["waitId"], authorize)
        assert observed["receiptBytes"] == first["receiptBytes"]
        assert observed["resultBytes"] == payload.resultBytes
        await reopened.dispose()

    asyncio.run(run())
