from __future__ import annotations

import json
from uuid import uuid4

from .occurrence_models import VisitScope, canonical, validate_spec


JOURNAL_KIND = "trellis-occurrences-v1"


class OccurrenceConflict(ValueError):
    pass


class HumanRoundLimit(RuntimeError):
    pass


def allocate(journal: dict, vertex_id: str, scope: VisitScope, spec: dict, admission: dict, kind: str) -> dict:
    key = scope.identity(vertex_id)
    spec_hash = validate_spec(spec)
    prior = journal["visits"].get(key)
    if prior is not None:
        if prior["specHash"] != spec_hash or prior["facts"] != scope.facts() or prior["kind"] != kind:
            raise OccurrenceConflict("occurrence_replay_conflict")
        return prior
    journal["revision"] += 1
    occurrence = scope.occurrence(spec["nodeId"], str(uuid4()))
    binding = {field: admission[field] for field in ("executionId", "publicationId", "engineJobId", "engineEpoch")}
    if kind == "native":
        request = {"version": 1, **binding, **occurrence, "admissionReceipt": admission,
                   "requestId": str(uuid4()), "specHash": spec_hash, **scope.facts()}
    else:
        request = {"version": 1, **binding, "occurrence": occurrence, "engineRequestId": str(uuid4()),
                   "actionKey": str(uuid4()), "expectedRevision": journal["revision"],
                   "deadlineRefs": list(scope.group_deadline_refs)}
    visit = {"vertexId": vertex_id, "occurrence": occurrence, "revision": journal["revision"],
             "specHash": spec_hash, "facts": scope.facts(), "kind": kind,
             "requestBytes": canonical(request), "waitId": str(uuid4()), "handleBytes": None,
             "feedback": [], "prior": []}
    journal["visits"][key] = visit
    return visit


def external_wait(visit: dict) -> str:
    wait = {"kind": visit["kind"], "waitId": visit["waitId"], "request": json.loads(visit["requestBytes"])}
    if visit["kind"] == "native":
        if visit["handleBytes"] is None:
            raise OccurrenceConflict("native_handle_not_retained")
        wait["handle"] = json.loads(visit["handleBytes"])
    return canonical(wait)


def replace_rejected(journal: dict, vertex_id: str, scope: VisitScope, spec: dict,
                     admission: dict, decision: dict, max_rounds: int | None) -> tuple[str, dict]:
    key = scope.identity(vertex_id)
    prior = journal["visits"][key]
    if prior["kind"] != "human" or decision["approved"] is not False:
        raise OccurrenceConflict("human_rejection_required")
    if decision["wait"] != json.loads(prior["requestBytes"]):
        raise OccurrenceConflict("human_rejection_wait_conflict")
    limit = max_rounds
    if limit is not None and len(prior["feedback"]) + 1 >= limit:
        prior["feedback"].append(decision)
        prior["terminalError"] = "human_round_limit"
        return external_wait(prior), prior
    old_wait = external_wait(prior)
    del journal["visits"][key]
    replacement = allocate(journal, vertex_id, scope, spec, admission, "human")
    replacement["feedback"] = [*prior["feedback"], decision]
    replacement["feedbackReceiptIds"] = list(prior.get("feedbackReceiptIds", []))
    replacement["prior"] = [*prior["prior"], {field: prior[field] for field in
                            ("occurrence", "revision", "requestBytes", "waitId")}]
    return old_wait, replacement
