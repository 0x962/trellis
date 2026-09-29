from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from langflow.services.database.models.jobs.model import Job, JobStatus, JobType
from langflow.services.database.models.user.model import User
from langflow.services.trellis_v1.authority import TrellisDeliveryAuthority
from langflow.services.trellis_v1.authority_recovery_models import RecoveryRequest, digest
from langflow.services.trellis_v1.authority_recovery_store import TrellisAuthorityRecovery
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.engine_api import EngineApiIdentity

JOB_ID = UUID("00000000-0000-4000-8000-000000000001")
USER_ID = UUID("00000000-0000-4000-8000-000000000002")
REQUEST_ID = UUID("00000000-0000-4000-8000-000000000003")
ISSUANCE_ID = UUID("00000000-0000-4000-8000-000000000004")
NOW = datetime(2026, 9, 29, 20, 0, tzinfo=timezone.utc)
OLD_IDENTITY = {
    "dataHomeId": "home-1", "hostId": "host-1", "ownerId": "owner-1",
    "instanceId": "00000000-0000-4000-8000-000000000005", "manifestDigest": "a" * 64,
}
CURRENT_IDENTITY = {
    "dataHomeId": "home-1", "hostId": "host-1", "ownerId": "owner-2",
    "instanceId": "00000000-0000-4000-8000-000000000006", "manifestDigest": "b" * 64,
}


def json_bytes(value) -> str:
    return json.dumps(value, separators=(",", ":"))


def authority(identity, *, epoch: int, revision: int, capability: str, issued: datetime, expires: datetime):
    return {
        "version": 1, "executionId": "execution-1", "publicationId": "publication-1",
        "engineJobId": str(JOB_ID), "engineEpoch": epoch, "hostId": "host-1", "projectId": "project-1",
        "publicationDigest": "c" * 64, "ownerId": identity["ownerId"], "ownershipRevision": revision,
        "capabilityId": capability, "permissions": ["execution.cancel"],
        "issuedAt": issued.isoformat().replace("+00:00", "Z"),
        "expiresAt": expires.isoformat().replace("+00:00", "Z"),
    }


def recovery_request(*, takeover: bool = True):
    old_observed = NOW - timedelta(hours=2)
    new_observed = NOW
    original = authority(
        OLD_IDENTITY, epoch=1, revision=1, capability="capability-1",
        issued=old_observed, expires=NOW - timedelta(hours=1),
    )
    correlation = {
        "version": 1, "hostId": "host-1", "executionId": "execution-1",
        "publicationId": "publication-1", "submissionDigest": "d" * 64,
        "engineJobId": str(JOB_ID), "engineSessionId": "session-1",
        "recordedAt": old_observed.isoformat().replace("+00:00", "Z"),
    }
    initial_permit = {
        "id": "00000000-0000-4000-8000-000000000008", "dataHomeId": "home-1", "generation": 1,
        "binding": {
            "effectId": "admission:execution-1", "kind": "admission", "executionId": "execution-1",
            "attemptId": None, "jobId": str(JOB_ID), "requestId": "initial-request", "payloadDigest": "e" * 64,
        },
    }
    permit_intent = {
        "operation": "takeover" if takeover else "renewal",
        "executionId": "execution-1",
        "requestId": str(REQUEST_ID),
        "expectedRevision": 1,
        "expiresAt": datetime(2099, 1, 1, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    if takeover:
        permit_intent.update(expectedOwnerId="owner-1", expectedEpoch=1)
    permit = {
        "id": "00000000-0000-4000-8000-000000000007", "dataHomeId": "home-1", "generation": 1,
        "binding": {
            "effectId": f"authority:execution-1:{REQUEST_ID}", "kind": "recovery", "executionId": "execution-1",
            "attemptId": None, "jobId": str(JOB_ID), "requestId": str(REQUEST_ID),
            "payloadDigest": digest(json_bytes(permit_intent)),
        },
    }
    initial = {
        "version": 1, "issuanceReceiptId": str(ISSUANCE_ID),
        "input": {
            "executionId": "execution-1", "hostId": "host-1", "projectId": "project-1",
            "publicationId": "publication-1", "publicationDigest": "c" * 64,
            "submissionDigest": "d" * 64, "correlation": correlation,
            "expiresAt": original["expiresAt"], "permissions": ["execution.cancel"], "permit": initial_permit,
        },
        "observation": {
            "id": "observation-old", "observedAt": original["issuedAt"],
            "endpoint": "http://127.0.0.1:49000", "identity": OLD_IDENTITY,
        },
        "authorityBytes": json_bytes(original),
    }
    target_identity = CURRENT_IDENTITY if takeover else OLD_IDENTITY
    successor = authority(
        target_identity, epoch=2 if takeover else 1, revision=2, capability="capability-2",
        issued=new_observed, expires=datetime(2099, 1, 1, tzinfo=timezone.utc),
    )
    if takeover:
        successor_request = {
            "version": 1, "executionId": "execution-1", "requestId": str(REQUEST_ID),
            "expectedOwnerId": "owner-1", "expectedEpoch": 1, "expectedRevision": 1,
            "newOwnerId": "owner-2", "supervisorObservationId": "observation-current",
            "priorOwnerRevocationId": "revocation-1",
        }
        receipt = {
            "version": 1, "request": successor_request, "requestDigest": digest(json_bytes(successor_request)),
            "transferId": "transfer-1", "committedAt": new_observed.isoformat().replace("+00:00", "Z"),
            "authority": successor, "admission": {"state": "closed", "barrierId": "barrier-1"},
        }
        revocation = {"id": "revocation-1", "identity": OLD_IDENTITY, "observationId": "observation-old"}
    else:
        successor_request = {
            "version": 1, "requestId": str(REQUEST_ID), "executionId": "execution-1", "ownerId": "owner-1",
            "engineEpoch": 1, "expectedRevision": 1, "supervisorObservationId": "observation-old",
        }
        receipt = {
            "version": 1, "request": successor_request, "requestDigest": digest(json_bytes(successor_request)),
            "renewalId": "renewal-1", "authority": successor,
        }
        revocation = None
    commit = {
        "permit": permit, "requestBytes": json_bytes(successor_request), "authorityBytes": json_bytes(successor),
        "receipt": receipt,
        "observation": {
            "id": "observation-current" if takeover else "observation-old",
            "observedAt": new_observed.isoformat().replace("+00:00", "Z"),
            "endpoint": "http://127.0.0.1:49000", "identity": target_identity,
        },
        "revocation": revocation,
    }
    if takeover:
        stops = '{"executionId":"execution-1","state":"stopped"}'
        commit["takeoverStops"] = {"sourceBytes": stops, "sourceDigest": digest(stops)}
    initial_bytes = json_bytes(initial)
    value = {
        "version": 1, "requestId": str(REQUEST_ID), "originalAuthorityBytes": initial["authorityBytes"],
        "initialRecordBytes": initial_bytes, "successorCommitBytes": json_bytes(commit),
    }
    return RecoveryRequest.model_validate(value), json_bytes(value).encode(), correlation


@pytest_asyncio.fixture
async def database(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'authority.db'}")
    tables = [model.__table__ for model in (
        Job, User, TrellisJobCorrelation, TrellisDeliveryAuthority, TrellisAuthorityRecovery,
    )]
    async with engine.begin() as connection:
        await connection.run_sync(lambda value: SQLModel.metadata.create_all(value, tables=tables))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    request, request_bytes, correlation = recovery_request()
    async with sessions() as session:
        session.add(User(id=USER_ID, username="fixture", password="unused", is_active=True))
        session.add(Job(
            job_id=JOB_ID,
            flow_id=UUID(int=8),
            user_id=USER_ID,
            status=JobStatus.SUSPENDED,
            type=JobType.WORKFLOW,
        ))
        session.add(TrellisJobCorrelation(
            actor_kind="human", actor_name="fixture", request_id=UUID(int=9), host_id="host-1",
            execution_id="execution-1", engine_job_id=JOB_ID, engine_session_id="session-1",
            barrier_id="barrier-1", submission_bytes=b"{}", submission_bytes_digest="d" * 64,
            correlation_receipt_bytes=json_bytes(correlation).encode(),
        ))
        await session.commit()
    identity = EngineApiIdentity(
        instanceId=CURRENT_IDENTITY["instanceId"], dataHomeId="home-1", hostId="host-1",
        manifestDigest="b" * 64, ownerId="owner-2",
    )
    yield SimpleNamespace(
        engine=engine,
        sessions=sessions,
        request=request,
        request_bytes=request_bytes,
        identity=identity,
    )
    await engine.dispose()
