from __future__ import annotations

import json
from uuid import UUID

from langflow.services.trellis_v1.native_records import checkpoint

from .projection_store import LATEST_KIND, snapshot_kind


def retained_record(state: str, record: dict) -> dict:
    return {"state": state, **{key: record[key] for key in (
        "sourceCursor", "snapshotBytes", "snapshotDigest", "sourceBytes", "sourceDigest",
    )}}


async def read_projection_checkpoint(session, job_id: UUID, *, after: int, engine_epoch: int) -> dict:
    latest_row = await checkpoint(session, job_id, LATEST_KIND)
    if latest_row is None:
        return {"state": "unavailable", "reason": "projection_checkpoint_missing"}
    latest = json.loads(latest_row.blob)
    current = json.loads(latest["snapshotBytes"])
    if current["engineEpoch"] != engine_epoch:
        return {"state": "unavailable", "reason": "projection_epoch_not_recorded"}
    if after > latest["sourceCursor"]:
        raise ValueError("projection_cursor_ahead")
    if after == latest["sourceCursor"]:
        return {"state": "unchanged", "sourceCursor": after}
    row = await checkpoint(session, job_id, snapshot_kind(after + 1))
    if row is None:
        return retained_record("gap", latest)
    record = json.loads(row.blob)
    snapshot = json.loads(record["snapshotBytes"])
    if snapshot["engineEpoch"] != engine_epoch:
        return retained_record("gap", latest)
    return retained_record("snapshot", record)
