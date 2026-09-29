import hashlib
import json
import os
from pathlib import Path

import pytest

from integrations.langflow.components.catalog.readCatalog import read_catalog

ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()
ENGINE = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
ENGINE_COMMIT = "fec71dca901949c09ed4d63315804337cd2eb13d"
MANIFEST = ROOT / "integrations/langflow/components/catalog/manifest.v1.json"


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


def test_review_gate_declaration_binds_real_source_and_branch_ports():
	manifest = json.loads(MANIFEST.read_bytes())
	definition = next(item for item in manifest["definitions"] if item["id"] == "review-gate-v1")
	assert definition["className"] == "TrellisReviewGateV1"
	assert definition["pythonModule"] == "integrations.langflow.components.jevGate.jevGate"
	assert definition["source"]["sha256"] == hashlib.sha256(
		(ROOT / definition["source"]["path"]).read_bytes()
	).hexdigest()
	assert [(port["name"], port["inputTypes"], port["isList"]) for port in definition["inputPorts"]] == [
		("inputs", ["Data"], True),
	]
	assert [(port["name"], port["method"], port["types"], port["groupOutputs"]) for port in definition["outputPorts"]] == [
		("yes", "yes", ["Data"], True), ("no", "no", ["Data"], True),
	]
	mapping = next(item for item in manifest["legacyMappings"] if item["id"] == "jev-gate")
	assert mapping["definitionIds"] == [definition["id"]]
	assert mapping["status"] == "blocked"
	assert definition["allowedForPublication"] is False
	assert definition["frontendTemplate"] is None


def test_loop_declaration_separates_scope_activation_from_selected_input():
	manifest = json.loads(MANIFEST.read_bytes())
	definition = next(item for item in manifest["definitions"] if item["id"] == "trellis-loop-v1")
	assert definition["className"] == "TrellisLoopV1"
	assert definition["pythonModule"] == "integrations.langflow.components.trellisLoop.trellisLoop"
	assert [(port["name"], port["class"], port["required"], port["isList"]) for port in definition["inputPorts"]] == [
		("scope_entry", "HandleInput", False, False),
		("seed", "HandleInput", False, False),
		("max_rounds", "IntInput", True, False),
	]
	assert [(port["name"], port["method"], port["allowsLoop"]) for port in definition["outputPorts"]] == [
		("children", "run_children", True), ("done", "finish", False),
	]
	assert all(port["types"] == ["Data"] and port["groupOutputs"] for port in definition["outputPorts"])
	assert definition["source"]["sha256"] == hashlib.sha256((ROOT / definition["source"]["path"]).read_bytes()).hexdigest()
	mapping = next(item for item in manifest["legacyMappings"] if item["id"] == "loop")
	assert mapping["definitionIds"] == [definition["id"]]
	assert mapping["status"] == "blocked"
	assert definition["allowedForPublication"] is False
	assert definition["frontendTemplate"] is None


@pytest.mark.parametrize("changed_source", ["definition", "reader", "import"])
def test_archive_without_git_metadata_detects_changed_component_bytes(tmp_path, changed_source):
	manifest = json.loads(MANIFEST.read_bytes())
	trellis_copy = tmp_path / "trellis"
	engine_copy = tmp_path / "engine"
	copy_manifest = trellis_copy / MANIFEST.relative_to(ROOT)
	copy_manifest.parent.mkdir(parents=True)
	copy_manifest.write_bytes(MANIFEST.read_bytes())
	sources = [
		*manifest["runtimeSources"],
		manifest["edgeHandles"]["engineSource"],
		manifest["edgeHandles"]["frontendSource"],
	]
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
	source = {
		"definition": manifest["definitions"][1]["source"],
		"reader": next(item for item in manifest["runtimeSources"] if item["path"].endswith("/readCatalog.py")),
		"import": next(item for item in manifest["runtimeSources"] if item["path"].endswith("/nativeCompletion/__init__.py")),
	}[changed_source]
	(trellis_copy / source["path"]).write_text("changed source\n")
	with pytest.raises(ValueError, match="catalog_component_digest_conflict"):
		read_catalog(trellis_copy, engine_copy, digest, engine_commit=ENGINE_COMMIT)


def test_group_declarations_keep_policy_and_runtime_ports_distinct():
	manifest = json.loads(MANIFEST.read_bytes())
	by_id = {item["id"]: item for item in manifest["definitions"]}
	expected = {
		"group-scope-v1": ("TrellisGroupScopeV1", ["boundary_inputs", "scope_definition"], "entries", "open"),
		"group-settlement-v1": ("TrellisGroupSettlementV1", ["result", "source_node_id"], "settlement", "settle"),
		"group-output-v1": ("TrellisGroupOutputV1", ["scope_entry", "settlements"], "out", "collect"),
	}
	for key, (class_name, inputs, output, method) in expected.items():
		definition = by_id[key]
		assert definition["className"] == class_name
		assert [port["name"] for port in definition["inputPorts"]] == inputs
		assert [(port["name"], port["method"], port["types"]) for port in definition["outputPorts"]] == [(output, method, ["Data"])]
		assert definition["source"]["sha256"] == hashlib.sha256((ROOT / definition["source"]["path"]).read_bytes()).hexdigest()
		assert definition["allowedForPublication"] is False
		assert definition["frontendTemplate"] is None
	for mapping in manifest["legacyMappings"]:
		if mapping["id"] in ("ordered-group", "parallel-group"):
			assert mapping["definitionIds"] == list(expected)
			assert mapping["status"] == "blocked"
