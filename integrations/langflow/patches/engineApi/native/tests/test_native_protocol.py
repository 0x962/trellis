from __future__ import annotations

import copy
import json
import os
from pathlib import Path

import pytest

from langflow.services.trellis_v1.native_protocol import (
    CompletionInput, NativeConflict, digest, serialized, validate_completion,
)


ROOT = Path(os.environ["TRELLIS_ROOT"]) / "apps/server/src/langflowContracts/fixtures"


def fixture():
    checkpoint = json.loads((ROOT / "checkpoint.json").read_text())
    wait = next(item for item in checkpoint["waits"] if item["kind"] == "native")
    request_bytes = serialized(wait["request"])
    result = json.loads((ROOT / "native-result.json").read_text())
    result["requestDigest"] = digest(request_bytes)
    result["output"] = "full output\\n" * 100_001
    result["outputHash"] = digest(result["output"])
    wait["handle"]["providerSessionId"] = result["providerSessionId"]
    delivery = json.loads((ROOT / "completion-delivery.json").read_text())
    delivery["result"] = result
    result_bytes = serialized(result)
    delivery["resultDigest"] = digest(result_bytes)
    payload = CompletionInput(engineWaitId=wait["waitId"], resultBytes=result_bytes, deliveryBytes=serialized(delivery), authorityBytes=serialized(delivery["authority"]))
    return payload, wait, request_bytes, delivery["authority"]


def test_preserves_full_result_and_original_request_bytes():
    payload, wait, request_bytes, authority = fixture()
    result = validate_completion(payload, wait, request_bytes, authority)
    assert len(result["output"]) > 1_000_000
    with pytest.raises(NativeConflict, match="native_request_digest_conflict"):
        validate_completion(payload, wait, request_bytes + "\n", authority)


@pytest.mark.parametrize("field", ["attemptId", "stepId", "agentRunId", "promptReceiptId", "providerSessionId"])
def test_rejects_forged_native_binding(field):
    payload, wait, request_bytes, authority = fixture()
    delivery = json.loads(payload.deliveryBytes)
    delivery["result"][field] = "00000000-0000-4000-8000-000000000099" if field == "attemptId" else "forged"
    payload.resultBytes = serialized(delivery["result"])
    delivery["resultDigest"] = digest(payload.resultBytes)
    payload.deliveryBytes = serialized(delivery)
    with pytest.raises(NativeConflict):
        validate_completion(payload, wait, request_bytes, authority)


def test_rejects_changed_authority_and_duplicate_json_fields():
    payload, wait, request_bytes, authority = fixture()
    changed = copy.deepcopy(authority)
    changed["capabilityId"] = "forged"
    with pytest.raises(NativeConflict, match="native_delivery_authority_conflict"):
        validate_completion(payload, wait, request_bytes, changed)
    payload.resultBytes = payload.resultBytes[:-1] + ',"version":1}'
    with pytest.raises(NativeConflict, match="duplicate_json_field"):
        validate_completion(payload, wait, request_bytes, authority)
