from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictStr

from .occurrence_journal import OccurrenceConflict
from .occurrence_models import canonical, digest


class ReviewGateSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    nodeId: StrictStr
    reviewArea: Literal["frontend", "backend"]


def review_gate_specs(document):
    graph = document.snapshot["graphDocument"]
    entries = graph["trellisReviewGatesV1"]
    result = {}
    for vertex_id, raw in entries.items():
        spec = ReviewGateSpec.model_validate(raw).model_dump()
        vertices = [node for node in graph["nodes"] if node["id"] == vertex_id]
        if len(vertices) != 1 or vertices[0]["data"]["type"] != "TrellisReviewGateV1":
            raise OccurrenceConflict("review_gate_definition_conflict")
        result[vertex_id] = {**spec, "specHash": digest(canonical(spec))}
    if len({entry["nodeId"] for entry in result.values()}) != len(result):
        raise OccurrenceConflict("review_gate_node_conflict")
    return result
