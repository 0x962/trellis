import json
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from langflow.services.database.factory import DatabaseServiceFactory
from langflow.services.database.models.jobs.model import JobStatus
from langflow.services.deps import get_job_service, get_settings_service
from langflow.services.trellis_v1.external_waits import TrellisExternalWaitBroker
from lfx.graph import Graph
from lfx.graph.checkpoint.store import InMemoryCheckpointStore
from lfx.graph.external_wait import ExternalWaitPending
from lfx.services.manager import get_service_manager
from lfx.services.schema import ServiceType

from integrations.langflow.components.catalog.nativeCompletion import TrellisNativeCompletionV1
from integrations.langflow.components.catalog.nativeDecision import TrellisNativeDecisionV1

ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()
FIXTURES = ROOT / "apps/server/src/langflowContracts/fixtures"


@pytest_asyncio.fixture
async def catalog_jobs(tmp_path, monkeypatch):
	settings = get_settings_service().settings.model_copy(update={
		"database_url": f"sqlite+aiosqlite:///{tmp_path / 'catalog.db'}",
	})
	database = DatabaseServiceFactory().create(SimpleNamespace(settings=settings))
	monkeypatch.setitem(get_service_manager().services, ServiceType.DATABASE_SERVICE, database)
	try:
		await database.run_migrations()
		yield get_job_service()
	finally:
		await database.teardown()


async def test_engine_resume_reads_the_exact_saved_native_result(catalog_jobs):
	fixture = json.loads((FIXTURES / "checkpoint.json").read_text())
	wait = next(item for item in fixture["waits"] if item["kind"] == "native")
	wait_bytes = json.dumps(wait, separators=(",", ":"))
	delivery_bytes = (FIXTURES / "completion-delivery.json").read_text()
	receipt_bytes = (FIXTURES / "completion-receipt.json").read_text()
	job_id = UUID(wait["request"]["engineJobId"])
	await catalog_jobs.create_job(job_id=job_id, flow_id=uuid4(), user_id=uuid4())
	await catalog_jobs.update_job_status(job_id, JobStatus.IN_PROGRESS)
	broker = TrellisExternalWaitBroker(catalog_jobs)
	store = InMemoryCheckpointStore()
	completion = TrellisNativeCompletionV1(_id="native-completion")
	completion.set(wait_bytes=wait_bytes)
	decision = TrellisNativeDecisionV1(_id="native-decision")
	decision.set(result=completion.wait_result)
	graph = Graph(completion, decision)
	graph.set_run_id("catalog-native-result")
	graph.job_id = str(job_id)
	graph.checkpointing_enabled = True
	graph.checkpoint_store = store
	graph.external_wait_handler = broker.receipt_for
	with pytest.raises(ExternalWaitPending):
		await graph.process(fallback_to_env_vars=False)
	checkpoint = await store.load_by_run_id("catalog-native-result")
	assert checkpoint is not None
	assert checkpoint.external_waits == {wait["waitId"]: wait_bytes}
	await catalog_jobs.save_checkpoint(job_id, "graph", checkpoint.model_dump_json())
	await catalog_jobs.suspend_job(job_id, {"external_wait_ids": [wait["waitId"]]})
	assert await broker.save_completion(
		job_id=job_id, authority_epoch=2, wait_bytes=wait_bytes,
		delivery_bytes=delivery_bytes, receipt_bytes=receipt_bytes,
	) == receipt_bytes
	assert await broker.delivery_for(graph, wait_bytes) == delivery_bytes
	resumed = Graph.resume_from_checkpoint(checkpoint, checkpoint_store=store)
	resumed.external_wait_handler = broker.receipt_for
	await resumed.process(fallback_to_env_vars=False)
	result = json.loads(delivery_bytes)["result"]
	assert resumed.get_vertex("native-completion").results["result"].data == result
	assert resumed.get_vertex("native-decision").results["yes"].data == result
	assert resumed.external_waits == {}
