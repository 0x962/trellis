import hashlib
import json
from pathlib import Path


def read_catalog(
	trellis_root: Path, engine_root: Path, expected_manifest_sha256: str, *, engine_commit: str,
) -> dict:
	manifest_path = trellis_root / "integrations/langflow/components/catalog/manifest.v1.json"
	manifest_bytes = manifest_path.read_bytes()
	if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
		raise ValueError("catalog_manifest_digest_conflict")
	manifest = json.loads(manifest_bytes)
	if manifest["schemaVersion"] != 1:
		raise ValueError("catalog_schema_unsupported")
	if engine_commit != manifest["engine"]["commit"]:
		raise ValueError("catalog_engine_identity_conflict")
	roots = {"trellis": trellis_root, "engine": engine_root}
	sources = [manifest["edgeHandles"]["engineSource"], manifest["edgeHandles"]["frontendSource"]]
	for definition in manifest["definitions"]:
		sources.extend([definition["source"], *definition["sourceDependencies"]])
	for source in sources:
		root = roots[source["root"]].resolve()
		path = (root / source["path"]).resolve()
		if not path.is_relative_to(root):
			raise ValueError("catalog_source_outside_root")
		if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
			raise ValueError("catalog_component_digest_conflict")
	return manifest
