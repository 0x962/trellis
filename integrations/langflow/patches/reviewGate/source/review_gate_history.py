import json

from sqlmodel import select

from langflow.services.database.models.jobs.model import Job
from langflow.services.trellis_v1.native_records import checkpoint

from .occurrence_journal import JOURNAL_KIND, OccurrenceConflict
from .occurrence_models import digest
from .review_classifications import acceptance_kind
from .review_gate_projection import read_review_projection
from .review_protocol import read_review_response, read_review_visit, read_review_wait


async def read_review_history(session, job_id):
    await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())
    row = await checkpoint(session, job_id, JOURNAL_KIND)
    if row is None:
        return []
    journal = json.loads(row.blob)
    result = []
    for visit in journal.get("reviewVisits", {}).values():
        request = read_review_visit(visit["requestBytes"])
        wait = read_review_wait(visit["waitBytes"])
        if (request.engineJobId != str(job_id) or wait.request.visit != request
                or wait.request.visitDigest != digest(visit["requestBytes"])
                or request.classificationRequestDigest != digest(journal["classificationRequestBytes"])):
            raise OccurrenceConflict("review_history_binding_conflict")
        accepted_id = visit["acceptedResultId"]
        projection = read_review_projection(visit)
        if accepted_id is not None:
            ledger = await checkpoint(session, job_id, acceptance_kind(request.requestId))
            if ledger is None:
                raise OccurrenceConflict("review_history_acceptance_missing")
            retained = json.loads(ledger.blob)
            if retained["resultBytes"] != visit["acceptedResultBytes"] or retained["waitBytes"] != visit["waitBytes"]:
                raise OccurrenceConflict("review_history_acceptance_conflict")
            accepted = read_review_response(visit["acceptedResultBytes"])
            if (accepted.visit != request or accepted.visitDigest != wait.request.visitDigest
                    or accepted.result.classificationReceiptId != accepted_id or accepted.result.state == "claimed"):
                raise OccurrenceConflict("review_history_result_conflict")
        result.append({**visit, "projection": projection, "state": projection["state"]})
    return result
