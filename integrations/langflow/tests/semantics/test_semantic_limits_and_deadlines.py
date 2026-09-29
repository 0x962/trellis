from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
sys.path.insert(0, str(SOURCE_ROOT / "src" / "backend"))

from lfx.graph.checkpoint.schema import GraphCheckpoint


@pytest.mark.parametrize(
	("node_count", "edge_count", "round_count", "deadline_minutes"),
	[(500, 2_000, 50, 1_440), (501, 2_001, 51, 1_441)],
)
def test_checkpoint_round_trip_has_no_fixture_ceiling(
	node_count: int,
	edge_count: int,
	round_count: int,
	deadline_minutes: int,
) -> None:
	launched_at = datetime(2026, 9, 29, tzinfo=timezone.utc)
	deadline_at = launched_at + timedelta(minutes=deadline_minutes)
	wait = json.dumps(
		{
			"kind": "native",
			"waitId": "dense-wait",
			"request": {
				"iterationPath": [{"loopNodeId": "loop", "round": round_count}],
				"deadlineAt": deadline_at.isoformat(),
			},
		},
		separators=(",", ":"),
	)
	checkpoint = GraphCheckpoint(
		run_id="dense-run",
		flow_payload={
			"nodes": [{"id": f"node-{index}"} for index in range(node_count)],
			"edges": [{"id": f"edge-{index}"} for index in range(edge_count)],
		},
		external_waits={"dense-wait": wait},
	)
	restored = GraphCheckpoint.model_validate_json(checkpoint.model_dump_json())
	assert len(restored.flow_payload["nodes"]) == node_count
	assert len(restored.flow_payload["edges"]) == edge_count
	assert json.loads(restored.external_waits["dense-wait"])["request"]["iterationPath"][0]["round"] == round_count
	assert datetime.fromisoformat(deadline_at.isoformat()) - launched_at == timedelta(minutes=deadline_minutes)


def test_group_deadline_starts_from_observed_launch() -> None:
	reserved_at = datetime(2026, 9, 29, 5, 0, tzinfo=timezone.utc)
	launched_at = datetime(2026, 9, 29, 6, 0, tzinfo=timezone.utc)
	receipt_at = datetime(2026, 9, 29, 6, 5, tzinfo=timezone.utc)
	budget = timedelta(minutes=1_441)
	deadline_at = launched_at + budget
	assert deadline_at != reserved_at + budget
	assert deadline_at != receipt_at + budget
	assert deadline_at - launched_at == budget
