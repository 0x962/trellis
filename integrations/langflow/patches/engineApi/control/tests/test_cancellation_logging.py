from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from structlog.contextvars import bound_contextvars, get_contextvars, merge_contextvars
from structlog.testing import capture_logs

from langflow.services.trellis_v1.cancellation import read_cancellation
from langflow.services.trellis_v1.cancellation_effects import cancel_execution, replay_cancellations
from langflow.services.trellis_v1.cancellation_models import CancelIntent

pytestmark = pytest.mark.asyncio


async def test_failed_stop_and_replay_keep_safe_receipt_context(fixture):
    background = SimpleNamespace(stop_job=AsyncMock(side_effect=OSError("private failure detail")))
    with bound_contextvars(outer_request="unchanged"):
        previous = get_contextvars()
        with capture_logs(processors=[merge_contextvars]) as logs:
            with pytest.raises(OSError, match="private failure detail"):
                await cancel_execution(fixture.sessions, background, fixture.security, fixture.input)
            assert get_contextvars() == previous
            async with fixture.sessions() as session:
                record = await read_cancellation(session, fixture.job_id)
            background.stop_job.side_effect = None
            background.stop_job.return_value = None
            await replay_cancellations(fixture.sessions, background)
            assert get_contextvars() == previous

    committed = next(entry for entry in logs if entry["event"] == "engine_cancellation_committed")
    failed = next(entry for entry in logs if entry["event"] == "engine_cancellation_stop_failed")
    observed = next(entry for entry in logs if entry["event"] == "engine_cancellation_status_observed")
    expected = record.receipt.structlog_log_context()
    for entry in [committed, failed, observed]:
        assert all(entry[key] == value for key, value in expected.items())
    assert logs.index(committed) < logs.index(failed) < logs.index(observed)
    assert failed["error_type"] == "OSError"
    assert observed["engine_status"] == "in_progress"
    serialized = json.dumps(logs)
    assert "private failure detail" not in serialized
    assert fixture.input.authority_bytes not in serialized
    assert fixture.input.cancel_intent_bytes not in serialized
    assert record.request_bytes not in serialized
    assert not any("authority_bytes" in entry or "cancel_intent_bytes" in entry or "request_bytes" in entry for entry in logs)


async def test_model_log_context_omits_private_bytes_and_actor_name(fixture):
    intent = CancelIntent.model_validate_json(fixture.input.cancel_intent_bytes)
    background = SimpleNamespace(stop_job=AsyncMock())
    receipt, _ = await cancel_execution(fixture.sessions, background, fixture.security, fixture.input)
    async with fixture.sessions() as session:
        record = await read_cancellation(session, fixture.job_id)
    contexts = [model.structlog_log_context() for model in [intent.actor, intent, fixture.input, receipt, record]]
    assert contexts[0] == {"actor_kind": "human"}
    allowed = {"actor_kind", "execution_id", "request_id", "engine_job_id", "receipt_id"}
    assert all(set(context) <= allowed for context in contexts)
