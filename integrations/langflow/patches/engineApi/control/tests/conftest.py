from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from langflow.services.database.models.jobs.model import ExecutionSignal, Job, JobCheckpoint, JobStatus
from langflow.services.database.models.user.model import User
from langflow.services.trellis_v1.authority import TrellisDeliveryAuthority, commit_authority
from langflow.services.trellis_v1.cancellation_models import CancellationInput
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.engine_api import EngineApiIdentity, EngineApiSecurity


@pytest_asyncio.fixture
async def fixture(tmp_path):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'cancellation.db'}"
    engine = create_async_engine(database_url)
    tables = [model.__table__ for model in (
        Job, JobCheckpoint, ExecutionSignal, User, TrellisJobCorrelation, TrellisDeliveryAuthority,
    )]
    async with engine.begin() as connection:
        await connection.run_sync(lambda connection: SQLModel.metadata.create_all(connection, tables=tables))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    @asynccontextmanager
    async def sessions():
        async with session_factory() as session:
            yield session

    now = datetime.now(timezone.utc)
    job_id, user_id, request_id = uuid4(), uuid4(), uuid4()
    authority = {
        "version": 1, "executionId": "execution-1", "publicationId": "publication-1",
        "engineJobId": str(job_id), "engineEpoch": 1, "hostId": "host-1", "projectId": "project-1",
        "publicationDigest": "a" * 64, "ownerId": "owner-1", "ownershipRevision": 1,
        "capabilityId": "capability-1", "permissions": ["execution.cancel", "completion.deliver"],
        "issuedAt": now.isoformat(), "expiresAt": (now + timedelta(hours=1)).isoformat(),
    }
    token = tmp_path / "authentication"
    token.write_text("fixture-bearer")
    token.chmod(0o600)
    security = EngineApiSecurity(authentication_file=token, identity=EngineApiIdentity(
        instance_id=uuid4(), data_home_id="home-1", host_id="host-1",
        manifest_digest="b" * 64, owner_id="owner-1",
    ))
    input = CancellationInput(
        execution_id="execution-1", publication_id="publication-1", engine_job_id=job_id,
        request_id=request_id, authority_bytes=json.dumps(authority),
        cancel_intent_bytes=json.dumps({
            "version": 1, "executionId": "execution-1", "requestId": str(request_id),
            "actor": {"kind": "human", "name": "fixture"}, "expectedRevision": 1,
            "requestedAt": now.isoformat(),
        }),
    )
    async with sessions() as session:
        session.add(User(id=user_id, username="fixture", password="unused", is_active=True))
        session.add(Job(job_id=job_id, flow_id=uuid4(), user_id=user_id, status=JobStatus.IN_PROGRESS))
        session.add(TrellisJobCorrelation(
            actor_kind="human", actor_name="fixture", request_id=uuid4(), host_id="host-1",
            execution_id="execution-1", engine_job_id=job_id, engine_session_id="session-1",
            barrier_id="barrier-1", submission_bytes=b"{}", submission_bytes_digest="c" * 64,
            correlation_receipt_bytes=b"{}",
        ))
        await commit_authority(session, input.authority_bytes.encode(), expected_capability_id=None)
        await session.commit()
    yield SimpleNamespace(
        engine=engine, sessions=sessions, security=security, input=input, job_id=job_id, user_id=user_id,
    )
    await engine.dispose()
