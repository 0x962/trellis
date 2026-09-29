from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
TRELLIS_ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()
sys.path.insert(0, str(SOURCE_ROOT / "src" / "backend"))
sys.path.insert(0, str(TRELLIS_ROOT))

from integrations.langflow.components.trellis_external_wait import TrellisExternalWaitComponent
from lfx.components.input_output import ChatOutput
from lfx.graph import Graph
from lfx.graph.checkpoint.store import InMemoryCheckpointStore
from lfx.graph.external_wait import ExternalWaitPending

TRL_666_SOURCE = "6246fcca805f6e5390f26b7924e28f27f7de0409"


def _contract_fixture(name: str) -> dict:
	result = subprocess.run(
		[
			"git",
			"-C",
			str(TRELLIS_ROOT),
			"show",
			f"{TRL_666_SOURCE}:apps/server/src/langflowContracts/fixtures/{name}.json",
		],
		check=True,
		capture_output=True,
		text=True,
	)
	return json.loads(result.stdout)


def _graph(store: InMemoryCheckpointStore, wait_bytes: str) -> Graph:
	wait = TrellisExternalWaitComponent(_id="human-wait")
	wait.set(wait_bytes=wait_bytes)
	successor = ChatOutput(_id="successor")
	successor.set(input_value=wait.wait, should_store_message=False)
	graph = Graph(wait, successor)
	graph.set_run_id("human-run")
	graph.job_id = "00000000-0000-4000-8000-000000000001"
	graph.checkpointing_enabled = True
	graph.checkpoint_store = store
	return graph


async def test_accepted_human_decision_resumes_the_component_and_one_successor() -> None:
	checkpoint_fixture = _contract_fixture("checkpoint")
	decision = _contract_fixture("human-decision")
	wait = next(item for item in checkpoint_fixture["waits"] if item["kind"] == "human")
	wait_bytes = json.dumps(wait, separators=(",", ":"))
	store = InMemoryCheckpointStore()
	graph = _graph(store, wait_bytes)

	async def pending(_graph: Graph, _wait_bytes: str) -> None:
		return None

	graph.external_wait_handler = pending
	with pytest.raises(ExternalWaitPending):
		await graph.process(fallback_to_env_vars=False)

	checkpoint = await store.load_by_run_id("human-run")
	assert checkpoint is not None
	assert checkpoint.external_waits == {"human-wait-1": wait_bytes}
	resumed = Graph.resume_from_checkpoint(checkpoint, checkpoint_store=store)
	resumed.human_input_decisions = {"human-request-1": decision}
	await resumed.process(fallback_to_env_vars=False)

	wait_vertex = resumed.get_vertex("human-wait")
	successor = resumed.get_vertex("successor")
	assert json.loads(wait_vertex.results["receipt"].text) == decision
	assert successor.built is True
	assert json.loads(successor.results["message"].text) == decision
	assert resumed.external_waits == {}
	completed_checkpoint = await store.load_by_run_id("human-run")
	assert completed_checkpoint is not None
	assert completed_checkpoint.external_waits == {}
