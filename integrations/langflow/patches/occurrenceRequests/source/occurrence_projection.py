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


def retain_accepted_result(visit, result, *, human=False):
    visit["projection"]["acceptedResultId"] = result["decisionId" if human else "completionId"]


def supersede_human_visit(visit):
    visit["projection"].update(
        state="skipped",
        skipReason="human_feedback_replaced",
        endedAt=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )
