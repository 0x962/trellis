from __future__ import annotations

import json
from datetime import datetime, timezone

from langflow.services.trellis_v1.native_records import checkpoint
from langflow.services.trellis_v1.occurrence_models import canonical
from langflow.services.trellis_v1.occurrence_store import save_blob


TERMINAL_STATES = {"succeeded", "failed", "canceled", "skipped"}


def _finish(row, state, *, error, observed_at):
    projection = row["projection"]
    if projection["state"] in TERMINAL_STATES:
        return False
    projection.update(state=state, endedAt=observed_at, error=error, skipReason=None)
    return True


async def terminalize_container_history(session, job_id, *, state, error=None):
    saved = await checkpoint(session, job_id, "graph")
    if saved is None:
        return
    graph = json.loads(saved.blob)
    observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    changed = False
    for visit in graph["group_visit_scopes"].values():
        changed = _finish(visit, state, error=error, observed_at=observed_at) or changed
    for loop in graph["trellis_loop_visits"].values():
        for visit in loop["history"]:
            changed = _finish(visit, state, error=error, observed_at=observed_at) or changed
    if changed:
        await save_blob(session, job_id, "graph", canonical(graph))
