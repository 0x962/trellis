import importlib

import pytest
from lfx.custom import Component
from lfx.graph import Graph
from lfx.graph.external_wait import ExternalWaitPending
from lfx.io import HandleInput, Output
from lfx.schema.data import Data

from integrations.langflow.components.jevGate.jevGate import TrellisReviewGateV1


class ReviewSink(Component):
    inputs = [HandleInput(name="value", display_name="Value", input_types=["Data"], required=True)]
    outputs = [Output(name="out", display_name="Output", method="read", types=["Data"])]

    def read(self):
        return self.value


@pytest.mark.parametrize("frontend,backend", [(True, False), (False, True), (True, True), (False, False)])
@pytest.mark.parametrize("area", ["frontend", "backend"])
async def test_real_graph_selects_the_classified_branch(monkeypatch, frontend, backend, area):
    module = importlib.import_module("integrations.langflow.components.jevGate.jevGate")
    branch = "yes" if {"frontend": frontend, "backend": backend}[area] else "no"
    async def scope(graph, vertex_id):
        return object()
    async def run(graph, vertex_id, visit):
        return {"branch": branch, "output": "classification", "response": {"result": {
            "classificationReceiptId": "one-classification", "state": "succeeded",
            "relevance": {"frontend": frontend, "backend": backend}}},
            "receipt": {"receiptId": "output", "receiptBytes": '{"occurrenceKey":"visit","output":"classification"}'}}
    monkeypatch.setattr(module, "capture_visit_scope", scope)
    monkeypatch.setattr(module, "run_review_visit", run)
    gate = TrellisReviewGateV1(_id="review")
    yes, no = ReviewSink(_id="yes-successor"), ReviewSink(_id="no-successor")
    yes.set(value=gate.yes)
    no.set(value=gate.no)
    graph = Graph()
    for component in (gate, yes, no):
        graph.add_component(component)
    await graph.process(fallback_to_env_vars=False)
    assert graph.get_vertex(f"{branch}-successor").built_object["out"].data["result"]["classificationReceiptId"] == "one-classification"
    assert graph.get_vertex("no-successor" if branch == "yes" else "yes-successor").built is False


async def test_pending_gate_returns_no_branch(monkeypatch):
    module = importlib.import_module("integrations.langflow.components.jevGate.jevGate")
    async def scope(graph, vertex_id):
        return object()
    async def pending(graph, vertex_id, visit):
        raise ExternalWaitPending({"review-wait": '{"kind":"review","waitId":"review-wait"}'})
    monkeypatch.setattr(module, "capture_visit_scope", scope)
    monkeypatch.setattr(module, "run_review_visit", pending)
    gate = TrellisReviewGateV1(_id="review")
    graph = Graph()
    graph.add_component(gate)
    with pytest.raises(ExternalWaitPending):
        await gate.yes()
