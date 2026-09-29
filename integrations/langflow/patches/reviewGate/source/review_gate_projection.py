from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictStr

from .occurrence_journal import OccurrenceConflict


class ReviewProjection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    state: Literal["pending", "running", "waiting_human", "unknown", "succeeded", "failed", "canceled", "skipped"]
    acceptedResultId: StrictStr | None
    startedAt: StrictStr | None
    endedAt: StrictStr | None
    error: StrictStr | None
    skipReason: StrictStr | None


def pending_review_projection():
    return {"state": "pending", "acceptedResultId": None, "startedAt": None,
            "endedAt": None, "error": None, "skipReason": None}


def read_review_projection(visit):
    projection = ReviewProjection.model_validate(visit.get("projection", {
        **pending_review_projection(), "state": "unknown", "acceptedResultId": visit["acceptedResultId"],
    })).model_dump()
    if projection["acceptedResultId"] != visit["acceptedResultId"]:
        raise OccurrenceConflict("review_projection_receipt_conflict")
    return projection


def start_review_projection(visit, observed_at):
    projection = read_review_projection(visit)
    if projection["state"] == "pending":
        projection["state"] = "running"
        projection["startedAt"] = observed_at
    elif projection["state"] == "unknown":
        projection["state"] = "running"
    visit["projection"] = projection


def accept_review_projection(visit, receipt_id):
    projection = read_review_projection(visit)
    if visit["acceptedResultId"] is not None and visit["acceptedResultId"] != receipt_id:
        raise OccurrenceConflict("review_receipt_conflict")
    visit["acceptedResultId"] = receipt_id
    projection["acceptedResultId"] = receipt_id
    visit["projection"] = projection
