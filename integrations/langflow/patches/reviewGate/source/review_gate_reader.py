import json
from uuid import UUID

from sqlmodel import select

from langflow.services.database.models.jobs.model import Job
from langflow.services.trellis_v1.correlation import TrellisJobCorrelation
from langflow.services.trellis_v1.native_records import checkpoint

from .occurrence_journal import JOURNAL_KIND, OccurrenceConflict
from .review_protocol import read_review_visit


async def read_review_visits(session, request_bytes):
    request = read_review_visit(request_bytes)
    job_id = UUID(str(request.engineJobId))
    await session.exec(select(Job).where(Job.job_id == job_id).with_for_update())
    correlation = (await session.exec(select(TrellisJobCorrelation).where(
        TrellisJobCorrelation.engine_job_id == job_id))).one()
    admission = json.loads(correlation.admission_receipt_bytes)
    if any(getattr(request, key) != admission[key] for key in ("executionId", "publicationId", "engineJobId")):
        raise OccurrenceConflict("review_visit_binding_conflict")
    row = await checkpoint(session, job_id, JOURNAL_KIND)
    if row is None:
        raise OccurrenceConflict("review_visit_not_retained")
    journal = json.loads(row.blob)
    visits = list(journal.get("reviewVisits", {}).values())
    exact = [visit for visit in visits if visit["requestBytes"] == request_bytes]
    if len(exact) != 1:
        raise OccurrenceConflict("review_visit_not_retained")
    matches = []
    for visit in visits:
        saved = read_review_visit(visit["requestBytes"])
        if (saved.classificationRequestId == request.classificationRequestId
                and saved.classificationRequestDigest == request.classificationRequestDigest):
            matches.append({"engineVertexId": visit["vertexId"], "requestBytes": visit["requestBytes"],
                            "waitBytes": visit["waitBytes"]})
    return {"requestBytes": request_bytes, "engineVertexId": exact[0]["vertexId"], "visits": matches}
