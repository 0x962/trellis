import json
from uuid import uuid4

from langflow.services.deps import session_scope

from .occurrence_journal import OccurrenceConflict
from .occurrence_models import digest
from .occurrence_store import locked_graph, save_graph, save_journal


async def allocate_control_visit(graph, vertex_id, scope, node_id):
    async with graph._external_wait_lock:
        async with session_scope() as session:
            job_id, admission, document, journal = await locked_graph(session, graph)
            nodes = document.snapshot["graphDocument"]["nodes"]
            node = next(item for item in nodes if item["id"] == vertex_id)
            if node["data"]["type"] != "TrellisGroupScopeV1":
                raise OccurrenceConflict("control_component_type_conflict")
            raw = node["data"]["node"]["template"]["scope_definition"]["value"]
            definition = json.loads(raw)
            if definition["groupNodeId"] != node_id:
                raise OccurrenceConflict("control_source_node_conflict")
            key = scope.identity(vertex_id)
            controls = journal.setdefault("controls", {})
            saved = controls.get(key)
            facts = {"definitionHash": digest(raw), "scope": scope.facts()}
            if saved is None:
                journal["revision"] += 1
                saved = {"occurrence": scope.occurrence(node_id, str(uuid4())), "facts": facts}
                controls[key] = saved
            elif saved["facts"] != facts:
                raise OccurrenceConflict("control_visit_replay_conflict")
            await save_journal(session, job_id, journal)
            await save_graph(session, job_id, graph)
            await session.commit()
    return saved["occurrence"]
