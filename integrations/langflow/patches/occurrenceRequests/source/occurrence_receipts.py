import json
from uuid import uuid4

from sqlmodel import select

from langflow.services.database.models.jobs.model import Job
from langflow.services.trellis_v1.decisions import TrellisDecisionAcceptance
from langflow.services.trellis_v1.native_records import add_checkpoint, checkpoint

from .occurrence_journal import JOURNAL_KIND, OccurrenceConflict
from .occurrence_models import canonical, digest


def output_key(vertex_id, scope, port):
    return digest(canonical([vertex_id, scope.parent_occurrence_key,
                             [[item.loop_node_id, item.round] for item in scope.iteration_path], port]))


def receipt_kind(receipt_id):
    return f"trellis-output-v1:{receipt_id}"


async def retain_output(session, job_id, admission, journal, *, vertex_id, scope, occurrence, port,
                        output, result_bytes):
    key = output_key(vertex_id, scope, port)
    outputs = journal.setdefault("outputs", {})
    if key in outputs:
        record = await checkpoint(session, job_id, receipt_kind(outputs[key]))
        saved = json.loads(record.blob)
        if saved["resultBytes"] != result_bytes or json.loads(saved["receiptBytes"])["output"] != output:
            raise OccurrenceConflict("output_receipt_replay_conflict")
        return saved
    receipt_id = f"output:{uuid4()}"
    receipt_bytes = canonical({
        "version": 1, "receiptId": receipt_id, "executionId": admission["executionId"],
        "publicationId": admission["publicationId"], "engineJobId": str(job_id),
        "nodeId": occurrence["nodeId"], "occurrenceKey": occurrence["occurrenceKey"], "output": output,
    })
    saved = {"receiptId": receipt_id, "receiptBytes": receipt_bytes, "receiptDigest": digest(receipt_bytes),
             "source": {"engineVertexId": vertex_id, "occurrence": occurrence, "outputPort": port},
             "resultBytes": result_bytes, "outputHash": digest(output)}
    add_checkpoint(session, job_id, receipt_kind(receipt_id), canonical(saved))
    outputs[key] = receipt_id
    await session.flush()
    return saved


async def read_receipt(session, job_id, admission, receipt_id):
    row = await checkpoint(session, job_id, receipt_kind(receipt_id))
    if row is None:
        raise OccurrenceConflict("input_receipt_missing")
    saved = json.loads(row.blob)
    receipt = json.loads(saved["receiptBytes"])
    if (saved["receiptId"] != receipt_id or receipt["receiptId"] != receipt_id
            or receipt["executionId"] != admission["executionId"]
            or receipt["publicationId"] != admission["publicationId"] or receipt["engineJobId"] != str(job_id)
            or digest(saved["receiptBytes"]) != saved["receiptDigest"]
            or digest(receipt["output"]) != saved["outputHash"]):
        raise OccurrenceConflict("input_receipt_binding_conflict")
    return {field: saved[field] for field in ("receiptId", "receiptBytes", "receiptDigest")}


async def read_native_visit(session, job_id, request_bytes):
    await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())
    row = await checkpoint(session, job_id, JOURNAL_KIND)
    if row is None:
        raise OccurrenceConflict("input_request_not_retained")
    journal = json.loads(row.blob)
    matches = [visit for visit in journal["visits"].values() if visit["requestBytes"] == request_bytes]
    if len(matches) != 1:
        raise OccurrenceConflict("input_request_not_retained")
    request = json.loads(request_bytes)
    if request["engineJobId"] != str(job_id):
        raise OccurrenceConflict("input_request_job_conflict")
    visit = matches[0]
    if visit["kind"] != "native":
        raise OccurrenceConflict("input_request_kind_conflict")
    return {"engineNodeId": visit["vertexId"], "requestBytes": visit["requestBytes"],
            "occurrence": visit["occurrence"], "scope": visit["facts"],
            "admissionReceipt": request["admissionReceipt"],
            "inputReceipts": [await read_receipt(session, job_id, request, receipt_id)
                              for receipt_id in request["inputReceiptIds"]]}


async def read_input_receipts(session, job_id, request_bytes):
    return (await read_native_visit(session, job_id, request_bytes))["inputReceipts"]


async def original_decision(session, job_id, decision):
    row = (await session.exec(select(TrellisDecisionAcceptance).where(
        TrellisDecisionAcceptance.decision_id == decision["decisionId"],
        TrellisDecisionAcceptance.engine_job_id == job_id,
    ))).one()
    raw = bytes(row.decision_bytes).decode("utf-8")
    if json.loads(raw) != decision or digest(raw) != row.payload_digest:
        raise OccurrenceConflict("human_decision_original_bytes_conflict")
    return raw
