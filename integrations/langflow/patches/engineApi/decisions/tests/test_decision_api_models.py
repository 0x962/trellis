import pytest
from pydantic import TypeAdapter, ValidationError

from langflow.services.trellis_v1.decision_api_models import (
    DecisionLookupRequest,
    DecisionLookupResult,
)


def lookup():
    return {
        "version": 1,
        "executionId": "execution-1",
        "engineJobId": "00000000-0000-4000-8000-000000000001",
        "engineRequestId": "human-request-1",
        "decisionId": "decision-1",
        "payloadDigest": "a" * 64,
    }


def test_lookup_preserves_exact_identity():
    value = lookup()
    assert DecisionLookupRequest.model_validate(value).model_dump(mode="json", by_alias=True) == value


@pytest.mark.parametrize("field,value", [
    ("version", 2),
    ("engineJobId", "not-a-uuid"),
    ("payloadDigest", "A" * 64),
    ("executionId", "execution/1"),
    ("decisionId", ""),
    ("unexpected", True),
])
def test_lookup_rejects_invalid_protocol_fields(field, value):
    with pytest.raises(ValidationError):
        DecisionLookupRequest.model_validate(lookup() | {field: value})


def test_authoritative_absence_requires_true():
    adapter = TypeAdapter(DecisionLookupResult)
    value = {"state": "absent", "lookup": lookup(), "authoritative": True}
    assert adapter.validate_python(value).model_dump(mode="json", by_alias=True) == value
    with pytest.raises(ValidationError):
        adapter.validate_python(value | {"authoritative": False})


def test_conflict_preserves_lookup_and_accepted_digest():
    adapter = TypeAdapter(DecisionLookupResult)
    value = {"state": "conflict", "lookup": lookup(), "acceptedDigest": "b" * 64}
    assert adapter.validate_python(value).model_dump(mode="json", by_alias=True) == value
