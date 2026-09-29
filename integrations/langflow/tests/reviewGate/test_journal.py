import json
from types import SimpleNamespace
from uuid import uuid4

import pytest

from langflow.services.trellis_v1.occurrence_journal import OccurrenceConflict
from langflow.services.trellis_v1.occurrence_models import VisitScope, canonical
from langflow.services.trellis_v1.review_gate_journal import allocate_review


def test_both_occurrences_share_classification_bytes_and_keep_distinct_waits():
    admission = {"executionId": "execution", "publicationId": "publication", "engineJobId": str(uuid4()), "engineEpoch": 1}
    journal = {"revision": 0, "visits": {}, "classificationRequestId": str(uuid4())}
    gates = {"front": {"nodeId": "front", "reviewArea": "frontend"}, "back": {"nodeId": "back", "reviewArea": "backend"}}
    document = SimpleNamespace(snapshot={"graphDocument": {"trellisReviewGatesV1": gates,
        "nodes": [{"id": key, "data": {"type": "TrellisReviewGateV1"}} for key in gates]}})
    shared = canonical({"version": 1, **{key: value for key, value in admission.items() if key != "engineEpoch"},
        "classificationRequestId": journal["classificationRequestId"], "diffId": "diff", "reviewedHead": "head",
        "gates": [gates[key] for key in sorted(gates)]})
    scope = VisitScope(None, "step", (), (), (), None)
    front = allocate_review(journal, "front", scope, document, admission, shared)
    back = allocate_review(journal, "back", scope, document, admission, shared)
    assert front == allocate_review(journal, "front", scope, document, admission, shared)
    assert front["waitBytes"] != back["waitBytes"]
    assert json.loads(front["requestBytes"])["classificationRequestDigest"] == json.loads(back["requestBytes"])["classificationRequestDigest"]
    assert journal["classificationRequestBytes"] == shared
    assert journal["visits"] == {}
    with pytest.raises(OccurrenceConflict, match="context_conflict"):
        allocate_review(journal, "front", scope, document, admission, shared + " ")
