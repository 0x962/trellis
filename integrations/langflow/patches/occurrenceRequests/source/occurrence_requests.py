from __future__ import annotations

import json

from langflow.services.deps import get_job_service, session_scope
from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker
from langflow.services.trellis_v1.native_records import request_kind

from .occurrence_handle import validate_handle
from .occurrence_journal import HumanRoundLimit, OccurrenceConflict, allocate, external_wait, replace_rejected
from .occurrence_models import VisitScope, canonical
from .occurrence_outputs import record_visit_output
from .occurrence_receipts import original_decision, retain_output
from .occurrence_store import apply_waits, authorize_native, locked_context, save_graph, save_journal, save_wait
from .occurrence_transport import request_transport


async def request_native(graph, vertex_id: str, scope: VisitScope) -> str:
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, spec, journal = await locked_context(session, graph, vertex_id)
            if spec["harness"] is None:
                raise OccurrenceConflict("native_harness_not_resolved")
            visit = allocate(journal, vertex_id, scope, spec, admission, "native")
            capability_id = await authorize_native(session, job_id, admission)
            await get_job_service().save_checkpoint_once_in_session(
                session, job_id, request_kind(visit["waitId"]), visit["requestBytes"],
            )
            await save_journal(session, job_id, journal)
            await save_graph(session, job_id, graph)
            await session.commit()
    handle_bytes = visit["handleBytes"]
    if handle_bytes is None:
        handle_bytes = await request_transport().reserve(visit["requestBytes"], capability_id)
        validate_handle(handle_bytes)
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, spec, journal = await locked_context(session, graph, vertex_id)
            retained = allocate(journal, vertex_id, scope, spec, admission, "native")
            if retained["requestBytes"] != visit["requestBytes"] or retained["waitId"] != visit["waitId"]:
                raise OccurrenceConflict("native_request_identity_conflict")
            if retained["handleBytes"] is not None and retained["handleBytes"] != handle_bytes:
                raise OccurrenceConflict("native_handle_replay_conflict")
            retained["handleBytes"] = handle_bytes
            wait_bytes = external_wait(retained)
            await save_journal(session, job_id, journal)
            waits = await save_wait(session, job_id, graph, wait_bytes)
            await session.commit()
        apply_waits(graph, waits)
    return wait_bytes


async def run_native_visit(graph, vertex_id: str, scope: VisitScope) -> dict:
    wait_bytes = await request_native(graph, vertex_id, scope)
    await graph.await_external_completion(wait_bytes)
    delivery = await TrellisExternalWaitBroker(get_job_service()).delivery_for(graph, wait_bytes)
    if delivery is None:
        raise OccurrenceConflict("native_delivery_not_retained")
    result = json.loads(delivery)["result"]
    await record_visit_output(graph, vertex_id, scope, result)
    return result


async def run_human_visit(graph, vertex_id: str, scope: VisitScope, *, max_rounds: int | None,
                          loop_condition: bool = False) -> dict:
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, spec, journal = await locked_context(session, graph, vertex_id)
            visit = allocate(journal, vertex_id, scope, spec, admission, "human")
            if "maxRounds" in visit and visit["maxRounds"] != max_rounds:
                raise OccurrenceConflict("human_round_policy_conflict")
            visit["maxRounds"] = max_rounds
            if "terminalError" in visit:
                raise HumanRoundLimit(visit["terminalError"])
            wait_bytes = external_wait(visit)
            request = json.loads(visit["requestBytes"])
            decision = getattr(graph, "human_input_decisions", {}).get(request["engineRequestId"])
            if decision is not None and decision["wait"] != request:
                raise OccurrenceConflict("human_decision_wait_conflict")
            replacing = None
            feedback_receipt = None
            if decision is not None:
                raw = await original_decision(session, job_id, decision)
                feedback_receipt = await retain_output(
                    session, job_id, admission, journal, vertex_id=vertex_id, scope=scope,
                    occurrence=visit["occurrence"], port=f"decision:{decision['decisionId']}",
                    output=raw, result_bytes=raw,
                )
            if decision is not None and decision["approved"] is False and not loop_condition:
                replacing, visit = replace_rejected(journal, vertex_id, scope, spec, admission, decision, max_rounds)
                visit["maxRounds"] = max_rounds
                visit.setdefault("feedbackReceiptIds", []).append(feedback_receipt["receiptId"])
                wait_bytes = external_wait(visit)
            await save_journal(session, job_id, journal)
            waits = await save_wait(session, job_id, graph, wait_bytes, replacing=replacing)
            await session.commit()
        apply_waits(graph, waits)
    if "terminalError" in visit:
        raise HumanRoundLimit(visit["terminalError"])
    if decision is not None and (decision["approved"] is True or loop_condition):
        await record_visit_output(graph, vertex_id, scope, decision, human=True)
        await graph.complete_external_wait(wait_bytes, canonical(decision))
        return decision
    await graph.await_external_completion(wait_bytes)
    raise OccurrenceConflict("human_wait_completed_without_decision")
