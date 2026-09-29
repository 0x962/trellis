import importlib
import inspect
import json
from pathlib import Path

from ..readCatalog import read_catalog


def export_frontend_templates(
	trellis_root: Path, engine_root: Path, expected_manifest_sha256: str, *, engine_commit: str,
	engine_overlay_sha256: str,
) -> bytes:
	manifest = read_catalog(trellis_root, engine_root, expected_manifest_sha256, engine_commit=engine_commit)
	roots = {"trellis": trellis_root.resolve(), "engine": engine_root.resolve()}
	engine_module = importlib.import_module("lfx.custom.custom_component.component")
	engine_source = manifest["edgeHandles"]["engineSource"]
	if Path(inspect.getfile(engine_module.Component)).resolve() != roots["engine"] / engine_source["path"]:
		raise ValueError("catalog_engine_import_conflict")
	definitions = []
	for definition in manifest["definitions"]:
		component_class = getattr(importlib.import_module(definition["pythonModule"]), definition["className"])
		source = definition["source"]
		source_path = roots[source["root"]] / source["path"]
		if Path(inspect.getfile(component_class)).resolve() != source_path.resolve():
			raise ValueError("catalog_component_import_conflict")
		component = component_class(_id=f"catalog-{definition['id']}")
		frontend_template = component.to_frontend_node()
		if frontend_template["data"]["node"]["template"]["code"]["value"] != source_path.read_text(encoding="utf-8"):
			raise ValueError("catalog_template_code_conflict")
		definitions.append({
			"id": definition["id"],
			"version": definition["version"],
			"className": definition["className"],
			"source": source,
			"qualification": definition["qualification"],
			"allowedForPublication": definition["allowedForPublication"],
			"frontendTemplate": frontend_template,
		})
	return json.dumps({
		"schemaVersion": 1,
		"kind": "trellis-frontend-templates",
		"catalogId": manifest["catalogId"],
		"componentManifestHash": expected_manifest_sha256,
		"engine": manifest["engine"],
		"engineOverlayHash": engine_overlay_sha256,
		"allowedForPublication": manifest["allowedForPublication"],
		"supportedMappings": manifest["supportedMappings"],
		"legacyMappings": manifest["legacyMappings"],
		"blockers": manifest["blockers"],
		"definitions": definitions,
	}, ensure_ascii=False, allow_nan=False, indent="\t").encode("utf-8") + b"\n"
