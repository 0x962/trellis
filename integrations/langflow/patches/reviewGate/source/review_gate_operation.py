import json
from uuid import UUID, uuid4

import httpx

from langflow.services.deps import get_job_service, session_scope
from langflow.services.trellis_v1.authority import read_authority, require_authority
from langflow.services.trellis_v1.review_classifications import ReviewClassificationLedger

from .occurrence_journal import OccurrenceConflict
from .occurrence_models import canonical
from .occurrence_receipts import retain_output
from .occurrence_store import apply_waits, locked_graph, save_journal, save_wait
from .review_gate_journal import allocate_review
from .review_gate_transport import review_gate_transport
from .review_protocol import read_review_response, read_review_wait


async def review_authority(session, job_id, admission):
    state = await read_authority(session, admission["executionId"])
    if state is None or state.binding is None:
        raise OccurrenceConflict("review_authority_absent")
    grant = await require_authority(session, state.binding.authority_bytes, "review.classify",
                                    execution_id=admission["executionId"], publication_id=admission["publicationId"],
                                    engine_job_id=job_id)
    return {"authority_bytes": grant.authority_bytes.decode("utf-8"), "capability_id": grant.authority.capability_id}


async def request_review_visit(graph, vertex_id, scope):
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, document, journal = await locked_graph(session, graph)
            journal.setdefault("classificationRequestId", str(uuid4()))
            context_request = canonical({"version": 1, "classificationRequestId": journal["classificationRequestId"],
                                         **{key: admission[key] for key in ("executionId", "publicationId", "engineJobId", "engineEpoch")}})
            shared = journal.get("classificationRequestBytes")
            authority = await review_authority(session, job_id, admission)
            await save_journal(session, job_id, journal)
            await session.commit()
    if shared is None:
        shared = await review_gate_transport().context(context_request, **authority)
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, document, journal = await locked_graph(session, graph)
            graph.get_vertex(vertex_id)
            visit = allocate_review(journal, vertex_id, scope, document, admission, shared)
            read_review_wait(visit["waitBytes"])
            authority = await review_authority(session, job_id, admission)
            await save_journal(session, job_id, journal)
            waits = await save_wait(session, job_id, graph, visit["waitBytes"])
            await session.commit()
        apply_waits(graph, waits)
    return visit, authority


async def run_review_visit(graph, vertex_id, scope):
    visit, authority = await request_review_visit(graph, vertex_id, scope)
    wait = read_review_wait(visit["waitBytes"])
    ledger = ReviewClassificationLedger(get_job_service())
    async def accepted():
        return await ledger.read_result(engine_job_id=UUID(wait.request.engineJobId), engine_request_id=wait.request.engineRequestId)
    raw = await accepted()
    if raw is None:
        try:
            await review_gate_transport().invoke(visit["requestBytes"], **authority)
        except httpx.TransportError:
            pass
        except httpx.HTTPStatusError as error:
            if error.response.status_code < 500:
                raise
    await graph.await_external_completion(visit["waitBytes"])
    raw = await accepted()
    if raw is None:
        raise OccurrenceConflict("review_completion_not_retained")
    result = read_review_response(raw.decode("utf-8"))
    if result.visit != wait.request.visit or result.visitDigest != wait.request.visitDigest or result.result.state == "claimed":
        raise OccurrenceConflict("review_completion_binding_conflict")
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, document, journal = await locked_graph(session, graph)
            stored = journal["reviewVisits"][scope.identity(vertex_id)]
            if stored["requestBytes"] != visit["requestBytes"] or stored["waitBytes"] != visit["waitBytes"]:
                raise OccurrenceConflict("review_completion_replay_conflict")
            prior = stored["acceptedResultId"]
            if prior is not None and prior != result.result.classificationReceiptId:
                raise OccurrenceConflict("review_receipt_conflict")
            stored["acceptedResultId"] = result.result.classificationReceiptId
            stored["acceptedResultBytes"] = raw.decode("utf-8")
            await save_journal(session, job_id, journal)
            await session.commit()
    if result.result.state == "failed":
        raise ValueError(result.result.error)
    relevance = result.result.relevance
    branch = "yes" if getattr(relevance, wait.request.reviewArea) else "no"
    output = json.dumps({"frontend": relevance.frontend, "backend": relevance.backend}, separators=(",", ":"))
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, document, journal = await locked_graph(session, graph)
            receipt = await retain_output(session, job_id, admission, journal, vertex_id=vertex_id, scope=scope,
                                          occurrence=wait.request.occurrence.model_dump(mode="json"), port=branch,
                                          output=output, result_bytes=raw.decode("utf-8"))
            journal["reviewVisits"][scope.identity(vertex_id)]["outputReceiptId"] = receipt["receiptId"]
            await save_journal(session, job_id, journal)
            await session.commit()
    return {"response": result.model_dump(mode="json"), "branch": branch, "output": output, "receipt": receipt}
