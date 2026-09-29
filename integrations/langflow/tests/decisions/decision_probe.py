from __future__ import annotations

import hashlib
import json
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

FIXTURE = Path(__file__).parent / "fixtures" / "human-decision.json"
CHECKPOINT_FIXTURE = Path(__file__).parent / "fixtures" / "checkpoint.json"
JOB_ID = UUID("00000000-0000-4000-8000-000000000001")
FLOW_ID = UUID("00000000-0000-4000-8000-000000000002")


def decision_bytes() -> bytes:
    return FIXTURE.read_bytes()


def decision() -> dict:
    return json.loads(decision_bytes())


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def human_wait() -> dict:
    checkpoint = json.loads(CHECKPOINT_FIXTURE.read_bytes())
    return next(wait for wait in checkpoint["waits"] if wait["kind"] == "human")


def open_session(database_url: str):
    engine = create_async_engine(database_url)
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def session_scope():
        async with sessions() as session, session.begin():
            yield session

    return engine, session_scope
