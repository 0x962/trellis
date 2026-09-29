import json
from uuid import UUID

import httpx
from sqlmodel import select

from langflow.services.database.models.jobs.model import Job, JobCheckpoint, JobStatus
from langflow.services.deps import session_scope
from langflow.services.trellis_v1.native_records import checkpoint

from .occurrence_handle import validate_handle
from .occurrence_journal import JOURNAL_KIND, OccurrenceConflict, external_wait
from .occurrence_models import canonical, digest
from .occurrence_store import apply_waits, authorize_native, locked_graph, save_blob, save_journal
from .occurrence_transport import request_transport


PREFIX = "trellis-native-reservation-obligation-v1:"


def reservation_wait(visit):
    return canonical({"kind": "native_reservation", "waitId": visit["waitId"],
                      "request": json.loads(visit["requestBytes"])})


async def save_reservation_obligation(session, job_id, visit, visit_key):
    kind = PREFIX + visit["waitId"]
    row = await checkpoint(session, job_id, kind)
    if row is not None:
        saved = json.loads(row.blob)
        if saved["requestBytes"] != visit["requestBytes"] or saved["visitKey"] != visit_key:
            raise OccurrenceConflict("reservation_obligation_replay_conflict")
        return saved
    request = json.loads(visit["requestBytes"])
    saved = {"engineJobId": str(job_id), "engineRequestId": request["requestId"],
             "waitId": visit["waitId"], "visitKey": visit_key, "requestBytes": visit["requestBytes"],
             "requestDigest": digest(visit["requestBytes"]), "handleConfirmed": visit["handleBytes"] is not None, "queueState": "pending"}
    await save_blob(session, job_id, kind, canonical(saved))
    return saved


async def pending_native_reservation_obligations(session):
    rows = (await session.exec(select(JobCheckpoint).where(JobCheckpoint.kind.startswith(PREFIX)))).all()
    return [json.loads(row.blob) for row in rows if json.loads(row.blob)["queueState"] == "pending"]


async def pending_native_reservations(session, job_id):
    rows = (await session.exec(select(JobCheckpoint).where(
        JobCheckpoint.job_id == job_id, JobCheckpoint.kind.startswith(PREFIX),
    ))).all()
    return [json.loads(row.blob)["waitId"] for row in rows if json.loads(row.blob)["queueState"] == "pending"]


async def recover_native_reservation(graph, wait_id):
    job_id = UUID(str(graph.job_id))
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).one()
            row = await checkpoint(session, job_id, PREFIX + wait_id)
            obligation = json.loads(row.blob)
            if job.status == JobStatus.CANCELLED:
                return "cancelled"
            job_id, admission, document, journal = await locked_graph(session, graph)
            visit = journal["visits"][obligation["visitKey"]]
            if visit["requestBytes"] != obligation["requestBytes"] or visit["waitId"] != wait_id:
                raise OccurrenceConflict("reservation_journal_conflict")
            if obligation["handleConfirmed"]:
                return True
            capability_id = await authorize_native(session, job_id, admission)
            await session.commit()
    try:
        handle_bytes = await request_transport().reserve(obligation["requestBytes"], capability_id)
        validate_handle(handle_bytes)
    except (httpx.HTTPError, UnicodeError, ValueError):
        return False
    return await retain_reserved_handle(graph, obligation, handle_bytes)


async def retain_reserved_handle(graph, obligation, handle_bytes):
    job_id = UUID(obligation["engineJobId"])
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).one()
            row = await checkpoint(session, job_id, PREFIX + obligation["waitId"])
            saved = json.loads(row.blob)
            journal_row = await checkpoint(session, job_id, JOURNAL_KIND)
            journal = json.loads(journal_row.blob)
            visit = journal["visits"][saved["visitKey"]]
            if visit["requestBytes"] != obligation["requestBytes"] or saved["requestBytes"] != obligation["requestBytes"]:
                raise OccurrenceConflict("reservation_journal_conflict")
            if visit["handleBytes"] is not None and visit["handleBytes"] != handle_bytes:
                raise OccurrenceConflict("native_handle_replay_conflict")
            visit["handleBytes"] = handle_bytes
            wait_bytes = external_wait(visit)
            graph_row = await checkpoint(session, job_id, "graph")
            snapshot = json.loads(graph_row.blob)
            waits = snapshot["external_waits"]
            current = waits.get(visit["waitId"])
            cancelled = job.status == JobStatus.CANCELLED
            if current not in (reservation_wait(visit), wait_bytes) and not cancelled:
                raise OccurrenceConflict("reservation_wait_replacement_conflict")
            if current is not None:
                waits[visit["waitId"]] = wait_bytes
                await save_blob(session, job_id, "graph", canonical(snapshot))
            saved.update(handleConfirmed=True, handleBytes=handle_bytes, nativeWaitBytes=wait_bytes)
            if cancelled:
                saved["stopReconciliationRequired"] = True
            await save_blob(session, job_id, PREFIX + visit["waitId"], canonical(saved))
            await save_journal(session, job_id, journal)
            await session.commit()
        apply_waits(graph, waits)
    return "cancelled" if cancelled else True


async def finish_native_reservation_obligation(session, job_id, wait_id, queue_result):
    job = (await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())).one()
    if job.status == JobStatus.CANCELLED:
        raise OccurrenceConflict("reservation_stop_reconciliation_required")
    row = await checkpoint(session, job_id, PREFIX + wait_id)
    saved = json.loads(row.blob)
    if queue_result not in ("dispatched", "execution_proven") or not saved["handleConfirmed"]:
        raise OccurrenceConflict("reservation_dispatch_not_proven")
    saved["queueState"] = queue_result
    await save_blob(session, job_id, PREFIX + wait_id, canonical(saved))
