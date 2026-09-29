from dataclasses import replace

from langflow.services.deps import session_scope

from .occurrence_journal import OccurrenceConflict
from .occurrence_models import VisitScope
from .occurrence_receipts import output_key, read_receipt
from .occurrence_store import locked_graph, save_graph, save_journal


def inherited_scope(graph, vertex_id):
    groups = getattr(graph, "group_active_occurrences", {})
    if vertex_id in groups:
        return VisitScope.from_engine(graph.group_visit_scope(groups[vertex_id], vertex_id))
    active_loop = getattr(graph, "trellis_loop_active_visit_key", None)
    if active_loop is not None:
        return VisitScope.from_engine(graph.trellis_current_visit_scope())
    if "trellisVisitScope" in graph.context:
        return VisitScope.from_engine(graph.context["trellisVisitScope"])
    return VisitScope(None, "step", (), (), (), None)


async def capture_visit_scope(graph, vertex_id):
    vertex = graph.get_vertex(vertex_id)
    inherited = inherited_scope(graph, vertex_id)
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, document, journal = await locked_graph(session, graph)
            scope_key = inherited.identity(vertex_id)
            scopes = journal.setdefault("scopes", {})
            if scope_key in scopes:
                return VisitScope.from_engine(scopes[scope_key]["scope"])
            receipt_ids = []
            selected = []
            excluded = graph.inactivated_vertices | graph.conditionally_excluded_vertices
            edges = [] if inherited.phase == "condition" else vertex.incoming_edges
            for edge in edges:
                if edge.source_id in excluded:
                    continue
                key = output_key(edge.source_id, inherited, edge.source_handle.name)
                receipt_id = journal.get("outputs", {}).get(key)
                if receipt_id is None:
                    raise OccurrenceConflict("incoming_edge_receipt_not_retained")
                receipt_ids.extend(journal.get("outputFeedback", {}).get(receipt_id, []))
                receipt_ids.append(receipt_id)
                selected.append({"edgeId": edge.to_data()["id"], "source": edge.source_id,
                                 "sourcePort": edge.source_handle.name, "receiptId": receipt_id})
            if not selected:
                receipt_ids = list(inherited.input_receipt_ids)
            for receipt_id in receipt_ids:
                await read_receipt(session, job_id, admission, receipt_id)
            scope = replace(inherited, input_receipt_ids=tuple(receipt_ids))
            encoded = scope.to_engine()
            scopes[scope_key] = {"scope": encoded, "selectedEdges": selected,
                                 "publicationId": admission["publicationId"]}
            await save_journal(session, job_id, journal)
            await save_graph(session, job_id, graph)
            await session.commit()
    return scope
