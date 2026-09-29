from datetime import datetime, timezone


def initial_projection(kind):
    return {
        "state": "waiting_human" if kind == "human" else "pending",
        "acceptedResultId": None,
        "startedAt": None,
        "endedAt": None,
        "error": None,
        "skipReason": None,
    }


def start_projection(visit):
    projection = visit["projection"]
    if projection["startedAt"] is None:
        projection["startedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def finish_projection(visit, state, *, error=None, skip_reason=None, observed_at=None):
    projection = visit["projection"]
    if projection["state"] in {"succeeded", "failed", "canceled", "skipped"}:
        return
    projection.update(
        state=state,
        endedAt=observed_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        error=error,
        skipReason=skip_reason,
    )


def retain_accepted_result(visit, result, *, human=False):
    visit["projection"]["acceptedResultId"] = result["decisionId" if human else "completionId"]


def supersede_human_visit(visit):
    visit["projection"].update(
        state="skipped",
        skipReason="human_feedback_replaced",
        endedAt=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )
