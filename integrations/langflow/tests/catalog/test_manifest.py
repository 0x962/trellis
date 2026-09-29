import hashlib
import importlib
import json
import os
from pathlib import Path

import pytest

from integrations.langflow.components.catalog.readCatalog import read_catalog

ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()
ENGINE = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
ENGINE_COMMIT = "fec71dca901949c09ed4d63315804337cd2eb13d"
MANIFEST = ROOT / "integrations/langflow/components/catalog/manifest.v1.json"
CLASSES = {
	"external-wait-v1": ("integrations.langflow.components.trellis_external_wait", "TrellisExternalWaitComponent"),
	"native-decision-v1": ("integrations.langflow.components.catalog.nativeDecision", "TrellisNativeDecisionV1"),
	"ordered-output-v1": ("integrations.langflow.components.catalog.orderedOutput", "TrellisOrderedOutputV1"),
	"stock-loop": ("lfx.components.flow_controls.loop", "LoopComponent"),
}


def test_manifest_checks_exact_source_bytes_and_keeps_conversion_blocked():
	manifest = read_catalog(ROOT, ENGINE, hashlib.sha256(MANIFEST.read_bytes()).hexdigest(), engine_commit=ENGINE_COMMIT)
	assert manifest["supportedMappings"] == []
	assert manifest["allowedForPublication"] is False
	assert {item["id"] for item in manifest["legacyMappings"]} == {
		"agent", "native-gate", "jev-gate", "human", "ordered-group", "parallel-group", "loop",
	}
	for mapping in manifest["legacyMappings"]:
		assert mapping["status"] == "blocked"
		assert mapping["executableFieldBindings"] is None
		assert mapping["nodeAssociations"] is None
		assert mapping["edgeAssociations"] is None
		assert mapping["blockerCodes"]
		assert all(code in manifest["blockers"] for code in mapping["blockerCodes"])


def test_reader_rejects_a_different_manifest_digest():
	with pytest.raises(ValueError, match="catalog_manifest_digest_conflict"):
		read_catalog(ROOT, ENGINE, "0" * 64, engine_commit=ENGINE_COMMIT)


def test_engine_classes_match_declared_ports_and_export_complete_templates():
	manifest = json.loads(MANIFEST.read_bytes())
	templates = {}
	for definition in manifest["definitions"]:
		module, class_name = CLASSES[definition["id"]]
		component = getattr(importlib.import_module(module), class_name)(_id="catalog-template")
		assert set(component._inputs) == {field["name"] for field in definition["template"]["inputs"]}
		for field in definition["template"]["inputs"]:
			actual = component._inputs[field["name"]]
			assert actual.input_types == field["inputTypes"]
			assert actual.is_list == field["isList"]
			assert actual.required == field["required"]
		for output in definition["outputPorts"]:
			actual = component.get_output(output["name"])
			assert actual.method == output["method"]
			assert actual.group_outputs == output["groupOutputs"]
		templates[definition["id"]] = component.to_frontend_node()
	output_path = Path(os.environ["LANGFLOW_RUN_ROOT"]) / "catalog-frontend-templates.json"
	output_path.write_text(json.dumps(templates, ensure_ascii=False, indent=2))


def test_archive_without_git_metadata_detects_changed_component_bytes(tmp_path):
	manifest = json.loads(MANIFEST.read_bytes())
	trellis_copy = tmp_path / "trellis"
	engine_copy = tmp_path / "engine"
	copy_manifest = trellis_copy / MANIFEST.relative_to(ROOT)
	copy_manifest.parent.mkdir(parents=True)
	copy_manifest.write_bytes(MANIFEST.read_bytes())
	sources = [manifest["edgeHandles"]["engineSource"], manifest["edgeHandles"]["frontendSource"]]
	for definition in manifest["definitions"]:
		sources.extend([definition["source"], *definition["sourceDependencies"]])
	for source in sources:
		original = ROOT if source["root"] == "trellis" else ENGINE
		copy = trellis_copy if source["root"] == "trellis" else engine_copy
		destination = copy / source["path"]
		destination.parent.mkdir(parents=True, exist_ok=True)
		destination.write_bytes((original / source["path"]).read_bytes())
	digest = hashlib.sha256(MANIFEST.read_bytes()).hexdigest()
	assert read_catalog(trellis_copy, engine_copy, digest, engine_commit=ENGINE_COMMIT) == manifest
	assert not (trellis_copy / ".git").exists()
	assert not (engine_copy / ".git").exists()
	source = manifest["definitions"][1]["source"]
	(trellis_copy / source["path"]).write_text("changed source\n")
	with pytest.raises(ValueError, match="catalog_component_digest_conflict"):
		read_catalog(trellis_copy, engine_copy, digest, engine_commit=ENGINE_COMMIT)
