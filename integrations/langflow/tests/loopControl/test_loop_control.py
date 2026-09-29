from __future__ import annotations

import copy
import os
import subprocess
import sys
from pathlib import Path

import pytest


ENGINE_COMMIT = "fec71dca901949c09ed4d63315804337cd2eb13d"
SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
assert subprocess.run(
	["git", "-C", str(SOURCE_ROOT), "rev-parse", "HEAD"],
	check=True,
	capture_output=True,
	text=True,
).stdout.strip() == ENGINE_COMMIT
sys.path.insert(0, str(SOURCE_ROOT / "src" / "backend"))

from lfx.graph import Graph


class CheckpointStore:
	def __init__(self) -> None:
		self.saved = []

	async def save(self, checkpoint) -> None:
		self.saved.append(copy.deepcopy(checkpoint))


def make_graph(*, parent: str = "execution-root", path: list[dict] | None = None) -> Graph:
	graph = Graph()
	graph.context = {
		"trellisVisitScope": {
			"parentOccurrenceKey": parent,
			"iterationPath": path or [],
			"groupDeadlineRefs": [
				{
					"deadlineId": "deadline-1",
					"groupOccurrenceKey": parent,
					"budgetMs": 60000,
					"launchedAt": "2026-09-29T20:00:00Z",
					"deadlineAt": "2026-09-29T20:01:00Z",
					"launchReceiptId": "launch-1",
				}
			],
			"deadlineAt": "2026-09-29T20:01:00Z",
		}
	}
	graph.checkpoint_store = CheckpointStore()
	return graph


async def begin(graph: Graph, *, node: str = "loop", rounds: int = 3) -> dict:
	return await graph.begin_trellis_loop_visit(
		loop_node_id=node,
		max_rounds=rounds,
		selected_inputs={"text": "seed"},
	)


async def commit_child(graph: Graph, visit: dict, *, round_number: int, human_wait: dict | None = None) -> dict:
	child = {
		"nodeId": "child",
		"occurrenceKey": f"child-{round_number}",
		"state": "completed",
		"receiptId": f"receipt-{round_number}",
		"outputBytes": f"child-{round_number}",
	}
	if human_wait is not None:
		child["humanWait"] = human_wait
	return await graph.commit_trellis_loop_children(
		visit["visitKey"],
		{
			"groupOccurrenceKey": visit["visitOccurrenceKey"],
			"outputBytes": child["outputBytes"],
			"children": [child],
		},
	)


async def test_one_round_runs_child_before_yes_condition() -> None:
	graph = make_graph()
	visit = await begin(graph)
	assert visit["phase"] == "children"
	visit = await commit_child(graph, visit, round_number=1)
	assert graph.trellis_loop_condition_scope(visit["visitKey"])["inputReceiptIds"] == ["receipt-1"]
	visit = await graph.commit_trellis_loop_condition(
		visit["visitKey"], {"exitKind": "completed", "output": " YES\n"}
	)
	assert visit["phase"] == "completed"
	assert visit["childOutput"]["outputBytes"] == "child-1"


@pytest.mark.parametrize(
	"result",
	[
		{"exitKind": "failed", "output": "YES"},
		{"exitKind": "completed", "output": "MAYBE"},
	],
)
async def test_failed_or_unknown_condition_fails_the_visit(result: dict) -> None:
	graph = make_graph()
	visit = await commit_child(graph, await begin(graph), round_number=1)
	with pytest.raises(ValueError, match="native_gate_decision_unknown"):
		await graph.commit_trellis_loop_condition(visit["visitKey"], result)


async def test_no_feedback_starts_next_round_with_exact_prior_output() -> None:
	graph = make_graph()
	visit = await commit_child(graph, await begin(graph), round_number=1)
	visit = await graph.commit_trellis_loop_condition(
		visit["visitKey"], {"exitKind": "completed", "output": "\tNO \n"}
	)
	assert visit["phase"] == "children"
	assert visit["round"] == 2
	assert visit["feedbackBytes"] == "\tNO \n"
	assert visit["priorOutputs"][0]["children"][0]["receiptId"] == "receipt-1"


async def test_no_on_explicit_last_round_fails_the_visit() -> None:
	graph = make_graph()
	visit = await commit_child(graph, await begin(graph, rounds=1), round_number=1)
	with pytest.raises(RuntimeError, match="loop_rounds_exhausted"):
		await graph.commit_trellis_loop_condition(
			visit["visitKey"], {"exitKind": "completed", "output": "NO"}
		)
	assert graph.read_trellis_loop_visit(visit["visitKey"])["phase"] == "failed"


async def test_nested_loop_keeps_the_full_outer_to_inner_path() -> None:
	graph = make_graph(path=[{"loopNodeId": "outer", "round": 2}])
	visit = await begin(graph, node="inner")
	assert visit["iterationPath"] == [
		{"loopNodeId": "outer", "round": 2},
		{"loopNodeId": "inner", "round": 1},
	]
	assert visit["parentOccurrenceKey"] == "execution-root"


async def test_later_round_retains_human_wait_identity_and_deadline() -> None:
	graph = make_graph()
	visit = await commit_child(graph, await begin(graph), round_number=1)
	visit = await graph.commit_trellis_loop_condition(
		visit["visitKey"], {"exitKind": "completed", "output": "NO"}
	)
	human_wait = {
		"waitId": "wait-2",
		"occurrenceKey": visit["visitOccurrenceKey"],
		"feedback": {"prompt": "Approve round two"},
	}
	visit = await commit_child(graph, visit, round_number=2, human_wait=human_wait)
	assert visit["childOutput"]["children"][0]["humanWait"] == human_wait
	assert graph.trellis_loop_condition_scope(visit["visitKey"])["deadlineAt"] == "2026-09-29T20:01:00Z"


async def test_restart_reads_the_same_visit_and_condition_scope() -> None:
	graph = make_graph()
	visit = await commit_child(graph, await begin(graph), round_number=1)
	scope = graph.trellis_loop_condition_scope(visit["visitKey"])
	restored = make_graph()
	restored.trellis_loop_visits = copy.deepcopy(graph.trellis_loop_visits)
	replayed = await begin(restored)
	assert replayed == visit
	assert restored.trellis_loop_condition_scope(visit["visitKey"]) == scope


async def test_round_values_above_fifty_remain_valid() -> None:
	graph = make_graph()
	visit = await begin(graph, rounds=51)
	for round_number in range(1, 51):
		visit = await commit_child(graph, visit, round_number=round_number)
		visit = await graph.commit_trellis_loop_condition(
			visit["visitKey"], {"exitKind": "completed", "output": "NO"}
		)
	visit = await commit_child(graph, visit, round_number=51)
	visit = await graph.commit_trellis_loop_condition(
		visit["visitKey"], {"exitKind": "completed", "output": "YES"}
	)
	assert visit["phase"] == "completed"
	assert visit["round"] == 51
	assert visit["iterationPath"][-1] == {"loopNodeId": "loop", "round": 51}
