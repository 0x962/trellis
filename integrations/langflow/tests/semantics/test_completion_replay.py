from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
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
			wait_bytes=wait,
			delivery_bytes=delivery,
			receipt_bytes=receipt,
		)
		second = await broker.save_completion(
			job_id=job_id,
			wait_bytes=wait,
			delivery_bytes=delivery,
			receipt_bytes=receipt,
		)
		assert first == second
		assert first == receipt
		graph = SimpleNamespace(job_id=str(job_id))
		assert await broker.receipt_for(graph, wait) == receipt

	asyncio.run(run())
