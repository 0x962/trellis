import json
from uuid import uuid4

from .occurrence_journal import OccurrenceConflict
from .occurrence_models import canonical, digest
from .review_gate_spec import review_gate_specs


def allocate_review(journal, vertex_id, scope, document, admission, shared_bytes):
    shared = json.loads(shared_bytes)
    specs = review_gate_specs(document)
    spec = specs[vertex_id]
    gates = [{"nodeId": value["nodeId"], "reviewArea": value["reviewArea"]} for value in specs.values()]
    gates.sort(key=lambda entry: entry["nodeId"].encode("utf-16-be", errors="surrogatepass"))
    if (shared["gates"] != gates or shared["classificationRequestId"] != journal["classificationRequestId"]
            or any(shared[field] != admission[field] for field in ("executionId", "publicationId", "engineJobId"))):
        raise OccurrenceConflict("review_classification_context_conflict")
    if "classificationRequestBytes" in journal and journal["classificationRequestBytes"] != shared_bytes:
        raise OccurrenceConflict("review_classification_context_conflict")
    journal["classificationRequestBytes"] = shared_bytes
    key = scope.identity(vertex_id)
    visits = journal.setdefault("reviewVisits", {})
    if key in visits:
        prior = visits[key]
        if prior["specHash"] != spec["specHash"] or prior["facts"] != scope.facts():
            raise OccurrenceConflict("review_visit_replay_conflict")
        return prior
    journal["revision"] += 1
    occurrence = scope.occurrence(spec["nodeId"], str(uuid4()))
    binding = {field: admission[field] for field in ("executionId", "publicationId", "engineJobId", "engineEpoch")}
    request = {
        "version": 1, **binding, **occurrence, "requestId": str(uuid4()),
        "classificationRequestId": shared["classificationRequestId"],
        "classificationRequestDigest": digest(shared_bytes), "diffId": shared["diffId"],
        "reviewedHead": shared["reviewedHead"], "specHash": spec["specHash"],
    }
    request_bytes = canonical(request)
    wait = {
        "kind": "review", "waitId": str(uuid4()),
        "request": {
            "version": 1, **binding, "occurrence": occurrence,
            "engineRequestId": request["requestId"], "actionKey": str(uuid4()),
            "reviewArea": spec["reviewArea"], "visit": request, "visitDigest": digest(request_bytes),
            "deadlineRefs": list(scope.group_deadline_refs),
        },
    }
    visit = {
        "vertexId": vertex_id, "specHash": spec["specHash"], "facts": scope.facts(),
        "requestBytes": request_bytes, "waitBytes": canonical(wait), "acceptedResultId": None,
    }
    visits[key] = visit
    return visit
