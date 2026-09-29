import json

from langflow.services.deps import session_scope

from .occurrence_models import canonical
from langflow.services.trellis_v1.native_records import checkpoint

from .occurrence_journal import OccurrenceConflict
from .occurrence_receipts import original_decision, receipt_kind, retain_output
from .occurrence_store import locked_context, locked_graph, save_graph, save_journal


async def record_visit_output(graph, vertex_id, scope, result, *, port="result", human=False):
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, spec, journal = await locked_context(session, graph, vertex_id)
            visit = journal["visits"][scope.identity(vertex_id)]
            raw = await original_decision(session, job_id, result) if human else canonical(result)
            receipt = await retain_output(
                session, job_id, admission, journal, vertex_id=vertex_id, scope=scope,
                occurrence=visit["occurrence"], port=port, output=raw if human else result["output"], result_bytes=raw,
            )
            visit.setdefault("outputReceiptIds", {})[port] = receipt["receiptId"]
            if human:
                journal.setdefault("outputFeedback", {})[receipt["receiptId"]] = list(visit.get("feedbackReceiptIds", []))
            await save_journal(session, job_id, journal)
            await save_graph(session, job_id, graph)
            await session.commit()
    return receipt


async def record_control_output(graph, vertex_id, scope, occurrence, port, result, *, output: str):
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, document, journal = await locked_graph(session, graph)
            raw = canonical(result)
            receipt = await retain_output(
                session, job_id, admission, journal, vertex_id=vertex_id, scope=scope,
                occurrence=occurrence, port=port, output=output, result_bytes=raw,
            )
            await save_journal(session, job_id, journal)
            await save_graph(session, job_id, graph)
            await session.commit()
    return receipt


def component_output(receipt, state):
    output = json.loads(receipt["receiptBytes"])
    return {"trellisOutput": {"occurrenceKey": output["occurrenceKey"], "state": state,
                              "outputBytes": output["output"], "receiptId": receipt["receiptId"]}}


async def record_forwarded_output(graph, vertex_id, scope, port, result):
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, document, journal = await locked_graph(session, graph)
            if len(scope.input_receipt_ids) != 1:
                raise OccurrenceConflict("gate_input_receipt_count")
            row = await checkpoint(session, job_id, receipt_kind(scope.input_receipt_ids[0]))
            source = json.loads(row.blob)
            original = {key: value for key, value in result.items() if key != "trellisOutput"}
            if json.loads(source["resultBytes"]) != original:
                raise OccurrenceConflict("gate_input_result_conflict")
            receipt = await retain_output(
                session, job_id, admission, journal, vertex_id=vertex_id, scope=scope,
                occurrence=source["source"]["occurrence"], port=port,
                output=json.loads(source["receiptBytes"])["output"], result_bytes=source["resultBytes"],
            )
            await save_journal(session, job_id, journal)
            await save_graph(session, job_id, graph)
            await session.commit()
    return receipt
