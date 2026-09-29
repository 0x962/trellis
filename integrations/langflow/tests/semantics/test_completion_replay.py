from __future__ import annotations

import asyncio
import copy
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
TRELLIS_ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()
sys.path.insert(0, str(SOURCE_ROOT / "src" / "backend"))

from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker


class _MemoryJobs:
	def __init__(self) -> None:
		self.values: dict[tuple[UUID, str], str] = {}

	async def load_checkpoint(self, job_id: UUID, kind: str) -> str | None:
		return self.values.get((job_id, kind))

	async def save_checkpoint_once(self, job_id: UUID, kind: str, blob: str) -> str:
		key = (job_id, kind)
		saved = self.values.setdefault(key, blob)
		if saved != blob:
			raise RuntimeError("checkpoint_identity_conflict")
		return saved


def _fixture(name: str) -> dict:
	path = TRELLIS_ROOT / "apps" / "server" / "src" / "langflowContracts" / "fixtures" / f"{name}.json"
	return json.loads(path.read_text())


def _bytes(value: dict) -> str:
	return json.dumps(value, separators=(",", ":"))


def test_equal_completion_replay_returns_exact_saved_bytes() -> None:
	async def run() -> None:
		job_id = UUID("00000000-0000-4000-8000-000000000001")
		wait = json.dumps({"kind": "admission", "waitId": "wait-1", "barrierId": "barrier-1"}, separators=(",", ":"))
		delivery = json.dumps({"version": 1}, separators=(",", ":"))
		receipt = json.dumps({"engineWaitId": "wait-1"}, separators=(",", ":"))
		jobs = _MemoryJobs()
		broker = TrellisExternalWaitBroker(jobs)
		first = await broker.save_completion(
			job_id=job_id,
			authority_epoch=1,
			wait_bytes=wait,
			delivery_bytes=delivery,
			receipt_bytes=receipt,
		)
		second = await broker.save_completion(
			job_id=job_id,
			authority_epoch=1,
			wait_bytes=wait,
			delivery_bytes=delivery,
			receipt_bytes=receipt,
		)
		assert first == second
		assert first == receipt
		graph = SimpleNamespace(job_id=str(job_id))
		assert await broker.receipt_for(graph, wait) == receipt

	asyncio.run(run())


def test_native_completion_requires_every_saved_binding_and_current_authority() -> None:
	async def run() -> None:
		checkpoint = _fixture("checkpoint")
		wait = next(item for item in checkpoint["waits"] if item["kind"] == "native")
		delivery = _fixture("completion-delivery")
		receipt = _fixture("completion-receipt")
		job_id = UUID(checkpoint["engineJobId"])
		jobs = _MemoryJobs()
		broker = TrellisExternalWaitBroker(jobs)
		accepted = await broker.save_completion(
			job_id=job_id,
			authority_epoch=2,
			wait_bytes=_bytes(wait),
			delivery_bytes=_bytes(delivery),
			receipt_bytes=_bytes(receipt),
		)
		assert accepted == _bytes(receipt)

		mutations = (
			("launch publication", delivery, ("result", "launchBinding", "publicationId"), "forged-publication"),
			("launch epoch", delivery, ("result", "launchBinding", "engineEpoch"), 0),
			("step", delivery, ("result", "stepId"), "forged-step"),
			("agent", delivery, ("result", "agentRunId"), "forged-agent"),
			("authority epoch", delivery, ("authority", "engineEpoch"), 1),
			("receipt execution", receipt, ("executionId",), "forged-execution"),
		)
		for _name, source, path, value in mutations:
			changed = copy.deepcopy(source)
			cursor = changed
			for key in path[:-1]:
				cursor = cursor[key]
			cursor[path[-1]] = value
			with pytest.raises(RuntimeError, match="completion_binding_conflict"):
				await broker.save_completion(
					job_id=job_id,
					authority_epoch=2,
					wait_bytes=_bytes(wait),
					delivery_bytes=_bytes(changed if source is delivery else delivery),
					receipt_bytes=_bytes(changed if source is receipt else receipt),
				)

	asyncio.run(run())


def test_out_of_order_completions_keep_independent_receipts() -> None:
	async def run() -> None:
		job_id = UUID("00000000-0000-4000-8000-000000000001")
		jobs = _MemoryJobs()
		broker = TrellisExternalWaitBroker(jobs)
		for wait_id in ("wait-b", "wait-a"):
			wait = _bytes({"kind": "admission", "waitId": wait_id, "barrierId": f"barrier-{wait_id}"})
			receipt = _bytes({"engineWaitId": wait_id})
			assert await broker.save_completion(
				job_id=job_id,
				authority_epoch=1,
				wait_bytes=wait,
				delivery_bytes=_bytes({"version": 1}),
				receipt_bytes=receipt,
			) == receipt
		assert len(jobs.values) == 2

	asyncio.run(run())
