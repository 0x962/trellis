import copy
import math

from lfx.graph.graph.base import Graph

from .catalog import catalog_of, source_bytes
from .contracts import InstalledPublicationPackage, PublicationRequest


def error(code: str, path: list | None = None) -> dict:
    return {"code": code, "message": "The installed engine cannot publish this document.",
            "severity": "error", "path": [] if path is None else path}


def validate(request: PublicationRequest, package: InstalledPublicationPackage) -> list[dict]:
    request.source()
    if request.enginePackageDigest != package.engine_package_digest:
        return [error("publication_package_mismatch")]
    if request.snapshot["componentManifestHash"] != package.component_manifest_hash:
        return [error("publication_manifest_mismatch")]
    catalog = catalog_of(package)
    definitions = {entry["className"]: entry for entry in catalog["definitions"]}
    graph = request.snapshot["graphDocument"]
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list) or not isinstance(graph.get("edges"), list):
        return [error("publication_graph_shape")]
    if not graph["nodes"]:
        return [error("publication_empty_graph")]
    diagnostics = []
    ids = set()
    for index, node in enumerate(graph["nodes"]):
        path = ["graphDocument", "nodes", index]
        if not isinstance(node, dict) or not isinstance(node.get("id"), str) or node["id"] in ids:
            diagnostics.append(error("publication_node_identity", path))
            continue
        ids.add(node["id"])
        data = node.get("data", {})
        definition = definitions.get(data.get("type")) if isinstance(data, dict) else None
        if definition is None or not definition["allowedForPublication"] or definition["frontendTemplate"] is None:
            diagnostics.append(error("publication_component_not_approved", path))
            continue
        installed = definition["frontendTemplate"]
        supplied = data.get("node", {})
        template = supplied.get("template", {})
        if template.get("code", {}).get("value") != source_bytes(package, definition["source"]).decode("utf-8"):
            diagnostics.append(error("publication_component_code", path))
            continue
        # Only declared input values may differ from the installed executable template.
        normalized = copy.deepcopy(supplied)
        for name, spec in installed["template"].items():
            if name == "code" or not isinstance(spec, dict):
                continue
            if name in normalized.get("template", {}) and isinstance(normalized["template"][name], dict):
                value = normalized["template"][name].get("value")
                if name in ("minutes", "max_rounds") and value is not None:
                    if type(value) is not int or value <= 0:
                        diagnostics.append(error("publication_deadline", path + [name]))
                normalized["template"][name]["value"] = spec.get("value")
        if normalized != installed:
            diagnostics.append(error("publication_component_template", path))
        position = node.get("position", {})
        if any(type(position.get(axis)) not in (int, float) or not math.isfinite(position[axis]) for axis in ("x", "y")):
            diagnostics.append(error("publication_geometry", path))
    for index, edge in enumerate(graph["edges"]):
        if not isinstance(edge, dict) or edge.get("source") not in ids or edge.get("target") not in ids:
            diagnostics.append(error("publication_edge_identity", ["graphDocument", "edges", index]))
    if diagnostics:
        return diagnostics
    payload = copy.deepcopy(graph)
    try:
        parsed = Graph.from_payload(payload, user_id=package.user_id,
                                    instantiate_components=False, emit_extension_events=False)
        parsed.sort_vertices()
    except (ValueError, TypeError, KeyError):
        return [error("publication_engine_graph")]
    if payload != graph:
        return [error("publication_engine_rewrite")]
    return []
