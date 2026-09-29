import hashlib
import importlib
import json
import os
import sys
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from integrations.langflow.components.catalog import export_frontend_templates

ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()
ENGINE = Path(os.environ["LANGFLOW_SOURCE_ROOT"]).resolve()
MANIFEST = ROOT / "integrations/langflow/components/catalog/manifest.v1.json"
ENGINE_COMMIT = "fec71dca901949c09ed4d63315804337cd2eb13d"
EXPORT_MODULE = "integrations.langflow.components.catalog.exportTemplates.exportTemplates"
SCHEMA = ROOT / "integrations/langflow/components/catalog/exportTemplates/frontend-templates.schema.v1.json"


def export_bytes():
	return export_frontend_templates(
		ROOT, ENGINE, hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
		engine_commit=ENGINE_COMMIT, engine_overlay_sha256=os.environ["LANGFLOW_OVERLAY_SHA256"],
	)


def test_complete_exports_match_engine_code_defaults_and_ports():
	manifest_bytes = MANIFEST.read_bytes()
	manifest = json.loads(manifest_bytes)
	exported = json.loads(export_bytes())
	schema = json.loads(SCHEMA.read_bytes())
	Draft202012Validator.check_schema(schema)
	Draft202012Validator(schema).validate(exported)
	assert exported["kind"] == "trellis-frontend-templates"
	assert exported["schemaVersion"] == 1
	assert exported["componentManifestHash"] == hashlib.sha256(manifest_bytes).hexdigest()
	assert exported["engine"] == manifest["engine"]
	assert exported["engineOverlayHash"] == os.environ["LANGFLOW_OVERLAY_SHA256"]
	for key in ("allowedForPublication", "supportedMappings", "legacyMappings", "blockers"):
		assert exported[key] == manifest[key]
	assert len(exported["definitions"]) == len(manifest["definitions"])
	for declaration, actual in zip(manifest["definitions"], exported["definitions"], strict=True):
		for key in ("id", "version", "className", "source", "qualification", "allowedForPublication"):
			assert actual[key] == declaration[key]
		component_class = getattr(importlib.import_module(declaration["pythonModule"]), declaration["className"])
		component = component_class(_id=f"catalog-{declaration['id']}")
		assert actual["frontendTemplate"] == component.to_frontend_node()
		assert declaration["frontendTemplate"] is None
		assert set(component._inputs) == {field["name"] for field in declaration["inputPorts"]}
		for field in declaration["inputPorts"]:
			port = component._inputs[field["name"]]
			assert port.input_types == field["inputTypes"]
			assert port.is_list == field["isList"]
			assert port.required == field["required"]
		assert {output.name for output in component.outputs} == {port["name"] for port in declaration["outputPorts"]}
		for field in declaration["outputPorts"]:
			port = component.get_output(field["name"])
			assert port.method == field["method"]
			assert port.group_outputs == field["groupOutputs"]
			assert port.allows_loop == field["allowsLoop"]
		root = ROOT if declaration["source"]["root"] == "trellis" else ENGINE
		assert actual["frontendTemplate"]["data"]["node"]["template"]["code"]["value"] == (
			root / declaration["source"]["path"]
		).read_text(encoding="utf-8")
	assert MANIFEST.read_bytes() == manifest_bytes


@pytest.mark.parametrize("change", ["catalog", "overlay", "template"])
def test_schema_rejects_malformed_export_identity_or_template(change):
	exported = json.loads(export_bytes())
	if change == "catalog":
		exported["componentManifestHash"] = "not-a-digest"
	elif change == "overlay":
		del exported["engineOverlayHash"]
	else:
		exported["definitions"][0]["frontendTemplate"] = None
	with pytest.raises(ValidationError):
		Draft202012Validator(json.loads(SCHEMA.read_bytes())).validate(exported)


@pytest.mark.parametrize("target,error", [
	("Component", "catalog_engine_import_conflict"),
	("TrellisNativeCompletionV1", "catalog_component_import_conflict"),
])
def test_export_rejects_imports_from_a_different_package(monkeypatch, tmp_path, target, error):
	module = importlib.import_module(EXPORT_MODULE)
	getfile = module.inspect.getfile
	monkeypatch.setattr(module.inspect, "getfile", lambda cls: str(tmp_path / "other.py") if cls.__name__ == target else getfile(cls))
	with pytest.raises(ValueError, match=error):
		export_bytes()


def test_export_rejects_substituted_code(monkeypatch):
	from integrations.langflow.components.catalog.nativeCompletion import TrellisNativeCompletionV1

	original = TrellisNativeCompletionV1.to_frontend_node

	def substitute(component):
		node = original(component)
		node["data"]["node"]["template"]["code"]["value"] = "substituted code"
		return node

	monkeypatch.setattr(TrellisNativeCompletionV1, "to_frontend_node", substitute)
	with pytest.raises(ValueError, match="catalog_template_code_conflict"):
		export_bytes()


def test_command_writes_original_export_bytes_and_refuses_overwrite(monkeypatch, tmp_path):
	module = importlib.import_module("integrations.langflow.components.catalog.exportTemplates.__main__")
	output = tmp_path / "frontend-templates.v1.json"
	monkeypatch.setattr(sys, "argv", [
		"exportTemplates", "--trellis-root", str(ROOT), "--engine-root", str(ENGINE),
		"--manifest-sha256", hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
		"--engine-commit", ENGINE_COMMIT, "--engine-overlay-sha256", os.environ["LANGFLOW_OVERLAY_SHA256"],
		"--output", str(output),
	])
	module.main()
	original = output.read_bytes()
	assert original == export_bytes()
	with pytest.raises(FileExistsError):
		module.main()
	assert output.read_bytes() == original


@pytest.mark.parametrize("source", [ROOT, ENGINE])
def test_command_refuses_source_root_alias_before_engine_import(monkeypatch, tmp_path, source):
	module = importlib.import_module("integrations.langflow.components.catalog.exportTemplates.__main__")
	alias = tmp_path / "alias"
	alias.symlink_to(source, target_is_directory=True)
	monkeypatch.setattr(sys, "argv", [
		"exportTemplates", "--trellis-root", str(ROOT), "--engine-root", str(ENGINE),
		"--manifest-sha256", "0" * 64, "--engine-commit", ENGINE_COMMIT,
		"--engine-overlay-sha256", "1" * 64, "--output", str(alias / "refused-export.json"),
	])
	with pytest.raises(ValueError, match="catalog_export_inside_source_root"):
		module.main()
	assert not (alias / "refused-export.json").exists()
