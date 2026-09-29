from __future__ import annotations

import json
from uuid import UUID


def submission_request(flow_id: UUID, engine_session_id: str) -> bytes:
    return json.dumps({
        "flow_id": str(flow_id),
        "mode": "background",
        "stream_protocol": "langflow",
        "input_value": "",
        "session_id": engine_session_id,
        "tweaks": {},
        "globals": {},
        "data": None,
        "files": None,
        "start_component_id": None,
        "stop_component_id": None,
        "output_ids": None,
        "expose_graph_state": True,
        "idempotency_key": None,
        "persist_messages": False,
        "end_user_id": None,
        "component_substitution_warning": None,
    }, separators=(",", ":")).encode("utf-8")
