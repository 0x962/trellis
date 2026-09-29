from __future__ import annotations

import asyncio
import inspect
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

SOURCE_ROOT = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
TRELLIS_ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()
sys.path.insert(0, str(SOURCE_ROOT / "src" / "backend"))
sys.path.insert(0, str(TRELLIS_ROOT))

pytest_plugins = ["tests.unit.background_execution.conftest"]

from lfx.graph.checkpoint.schema import GraphCheckpoint
from integrations.langflow.components.trellis_external_wait import TrellisExternalWaitComponent
from langflow.services.background_execution.runner import JobRunner
from langflow.services.background_execution.service import BackgroundExecutionService
from langflow.services.database.models.jobs.model import JobStatus, SignalType
from langflow.services.jobs.service import JobService
from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker

TRL_666_SOURCE = "6246fcca805f6e5390f26b7924e28f27f7de0409"


def _contract_fixture(name: str) -> dict:
	result = subprocess.run(
		[
			"git",
			"-C",
			os.environ["TRELLIS_ROOT"],
			"show",
			f"{TRL_666_SOURCE}:apps/server/src/langflowContracts/fixtures/{name}.json",
		],
		check=True,
		capture_output=True,
		text=True,
	)
	return json.loads(result.stdout)


def _wait(job_id: UUID, wait_id: str) -> str:
	return json.dumps(
		{
			"kind": "admission",
			"waitId": wait_id,
			"barrierId": f"barrier-{wait_id}",
		},
		separators=(",", ":"),
	)


def _checkpoint(job_id: UUID, waits: dict[str, str]) -> str:
	return GraphCheckpoint(
		run_id=str(job_id),
		job_id=str(job_id),
		external_waits=waits,
	).model_dump_json()


async def _suspended_job(job_service, waits: dict[str, str]):
	job_id = uuid4()
	await job_service.create_job(job_id=job_id, flow_id=uuid4(), user_id=uuid4())
	await job_service.update_job_status(job_id, JobStatus.IN_PROGRESS)
	await job_service.save_checkpoint(job_id, "graph", _checkpoint(job_id, waits))
	await job_service.suspend_job(job_id, {"external_wait_ids": list(waits)})
	return job_id


def _signal_data(wait_id: str, obligation_id: UUID) -> dict[str, str]:
	return {
		"kind": "trellis_external_completion_v1",
		"engineRequestId": wait_id,
		"decisionId": None,
		"enqueueObligationId": str(obligation_id),
	}


def test_imports_resolve_to_the_patched_pin() -> None:
	for value in (
		GraphCheckpoint,
		JobRunner,
		BackgroundExecutionService,
		JobService,
		TrellisExternalWaitBroker,
	):
		path = Path(inspect.getfile(value)).resolve()
		assert path.is_relative_to(SOURCE_ROOT)


def test_published_service_seams_have_one_owner() -> None:
	parameters = inspect.signature(JobService.consume_suspended_continuation_in_session).parameters
	assert tuple(parameters) == (
		"self",
		"session",
		"engine_job_id",
		"engine_request_id",
		"decision_id",
		"signal_id",
		"enqueue_obligation_id",
	)
	lookup_source = inspect.getsource(BackgroundExecutionService.lookup_trellis_human_decision)
	assert "DecisionAcceptanceLedger().lookup" in lookup_source
	dispatch_source = inspect.getsource(BackgroundExecutionService._enqueue_queued_continuation)
	assert "trellis-continuation-v1:" in dispatch_source
	assert "trellis-dispatch-v1:" in dispatch_source
	assert 'return "pending_lease"' in dispatch_source
	proof_source = inspect.getsource(BackgroundExecutionService._continuation_execution_proof)
	assert "continuation_signal_id" in proof_source
	assert 'return "cancelled"' in proof_source
	retry_source = inspect.getsource(BackgroundExecutionService._schedule_trellis_lease_retry)
	assert "background_lease_ttl_s" in retry_source
	startup_source = inspect.getsource(BackgroundExecutionService.sweep_orphans_on_startup)
	assert 'f"queued-job:{job.job_id}"' in startup_source
	assert "self.sweep_orphans_on_startup" in startup_source
	stop_source = inspect.getsource(BackgroundExecutionService.stop)
	assert "_trellis_lease_retry_tasks" in stop_source


async def test_human_wait_reads_the_accepted_decision_by_engine_request_id() -> None:
	checkpoint_fixture = _contract_fixture("checkpoint")
	decision = _contract_fixture("human-decision")
	wait = next(item for item in checkpoint_fixture["waits"] if item["kind"] == "human")
	request_id = wait["request"]["engineRequestId"]

	async def unexpected_completion(_wait_bytes: str) -> str:
		raise AssertionError("An accepted human decision must not use the native completion store.")

	async def complete_wait(wait_bytes: str, decision_bytes: str) -> str:
		assert wait_bytes == json.dumps(wait, separators=(",", ":"))
		return decision_bytes

	component = TrellisExternalWaitComponent()
	component.wait_bytes = json.dumps(wait, separators=(",", ":"))
	component.graph = SimpleNamespace(
		human_input_decisions={request_id: decision},
		await_external_completion=unexpected_completion,
		complete_external_wait=complete_wait,
	)
	result = await component.wait()
	assert json.loads(result.text) == decision
	assert wait["waitId"] == "human-wait-1"
	assert request_id == "human-request-1"
	assert wait["waitId"] != request_id


@pytest.mark.real_services
async def test_kill_after_resume_read_requeues_without_consuming_signal(real_services_job_service) -> None:
	wait_id = "kill-window"
	job_id = await _suspended_job(real_services_job_service, {wait_id: _wait(uuid4(), wait_id)})
	obligation_id = uuid4()
	signal = await real_services_job_service.write_signal(
		job_id,
		SignalType.RESUME,
		_signal_data(wait_id, obligation_id),
	)
	receipt = await real_services_job_service.consume_suspended_continuation(
		engine_job_id=job_id,
		engine_request_id=wait_id,
		decision_id=None,
		signal_id=signal.id,
		enqueue_obligation_id=obligation_id,
	)
	assert receipt is not None
	await real_services_job_service.update_job_status(job_id, JobStatus.IN_PROGRESS)
	runner = JobRunner(
		job_service=real_services_job_service,
		live_bus=SimpleNamespace(),
		adapter=SimpleNamespace(),
		frame_source=SimpleNamespace(),
	)
	resume = await runner._maybe_resume(job_id)
	assert resume == {"kind": "external_wait", "request_id": wait_id}
	assert [item.id for item in await real_services_job_service.unconsumed_signals(job_id)] == [signal.id]
	old = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
	await real_services_job_service.update_job_metadata(job_id, {"owner": "dead-worker", "heartbeat_at": old})
	assert await real_services_job_service.sweep_orphans(lease_ttl_s=1.0) == []
	assert (await real_services_job_service.get_job_by_job_id(job_id)).status == JobStatus.QUEUED


@pytest.mark.real_services
async def test_distinct_completions_share_one_queue_claim(real_services_job_service) -> None:
	wait_ids = ("wait-a", "wait-b")
	job_id = await _suspended_job(
		real_services_job_service,
		{wait_id: _wait(uuid4(), wait_id) for wait_id in wait_ids},
	)
	obligation_ids = (uuid4(), uuid4())
	signals = [
		await real_services_job_service.write_signal(
			job_id,
			SignalType.RESUME,
			_signal_data(wait_id, obligation_id),
		)
		for wait_id, obligation_id in zip(wait_ids, obligation_ids, strict=True)
	]
	receipts = await asyncio.gather(
		*(
			real_services_job_service.consume_suspended_continuation(
				engine_job_id=job_id,
				engine_request_id=wait_id,
				decision_id=None,
				signal_id=signal.id,
				enqueue_obligation_id=obligation_id,
			)
			for wait_id, obligation_id, signal in zip(wait_ids, obligation_ids, signals, strict=True)
		)
	)
	parsed = [json.loads(receipt) for receipt in receipts if receipt is not None]
	assert len(parsed) == 2
	assert sum(receipt["queueClaimed"] for receipt in parsed) == 1
	assert (await real_services_job_service.get_job_by_job_id(job_id)).status == JobStatus.QUEUED
	assert {item.id for item in await real_services_job_service.unconsumed_signals(job_id)} == {
		signal.id for signal in signals
	}


class _CheckpointStore:
	def __init__(self, checkpoint: GraphCheckpoint) -> None:
		self.checkpoint = checkpoint

	async def load_by_run_id(self, _run_id: str) -> GraphCheckpoint:
		return self.checkpoint


@pytest.mark.real_services
async def test_published_human_identities_compose_without_rewriting(real_services_job_service) -> None:
	checkpoint_fixture = _contract_fixture("checkpoint")
	decision = _contract_fixture("human-decision")
	job_id = UUID(checkpoint_fixture["engineJobId"])
	waits = {
		wait["waitId"]: json.dumps(wait, separators=(",", ":"))
		for wait in checkpoint_fixture["waits"]
	}
	await real_services_job_service.create_job(job_id=job_id, flow_id=uuid4(), user_id=uuid4())
	await real_services_job_service.update_job_status(job_id, JobStatus.IN_PROGRESS)
	checkpoint = GraphCheckpoint(run_id=str(job_id), job_id=str(job_id), external_waits=waits)
	await real_services_job_service.save_checkpoint(job_id, "graph", checkpoint.model_dump_json())
	await real_services_job_service.suspend_job(job_id, {"external_wait_ids": list(waits)})
	obligation_id = uuid4()
	request_id = decision["wait"]["engineRequestId"]
	signal = await real_services_job_service.write_signal(
		job_id,
		SignalType.RESUME,
		{
			"kind": "trellis_human_decision_v1",
			"engineRequestId": request_id,
			"decisionId": decision["decisionId"],
			"enqueueObligationId": str(obligation_id),
			"decision": decision,
		},
	)
	receipt = await real_services_job_service.consume_suspended_continuation(
		engine_job_id=job_id,
		engine_request_id=request_id,
		decision_id=decision["decisionId"],
		signal_id=signal.id,
		enqueue_obligation_id=obligation_id,
	)
	assert receipt is not None
	runner = JobRunner(
		job_service=real_services_job_service,
		live_bus=SimpleNamespace(),
		adapter=SimpleNamespace(),
		frame_source=SimpleNamespace(),
		checkpoint_store=_CheckpointStore(checkpoint),
	)
	resume = await runner._maybe_resume(job_id)
	assert resume == {"request_id": request_id, "decision": decision}
	assert "human-wait-1" in waits
	assert request_id == "human-request-1"
	assert request_id not in waits
	runner_source = inspect.getsource(JobRunner.run)
	assert '"request_id": wait["request"]["engineRequestId"]' in runner_source
	assert '"trellis_wait_v1": wait["request"]' in runner_source
