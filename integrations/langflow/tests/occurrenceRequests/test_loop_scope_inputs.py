from types import SimpleNamespace

from langflow.services.trellis_v1.occurrence_scope import selected_input_edges


def test_loop_activation_keeps_seed_order_without_an_activation_receipt():
    activation = SimpleNamespace(target_param="scope_entry")
    seed = SimpleNamespace(target_param="seed")
    vertex = SimpleNamespace(incoming_edges=[activation, seed])
    assert selected_input_edges(vertex, "TrellisLoopV1", "children") == [seed]
    assert vertex.incoming_edges == [activation, seed]
    assert selected_input_edges(SimpleNamespace(incoming_edges=[activation]), "TrellisLoopV1", "children") == []
    assert selected_input_edges(SimpleNamespace(incoming_edges=[]), "TrellisLoopV1", "step") == []


def test_activation_name_on_another_component_does_not_remove_its_input():
    edge = SimpleNamespace(target_param="scope_entry")
    vertex = SimpleNamespace(incoming_edges=[edge])
    assert selected_input_edges(vertex, "TrellisNativeAgentV1", "children") == [edge]
    assert selected_input_edges(vertex, "TrellisNativeAgentV1", "condition") == []
