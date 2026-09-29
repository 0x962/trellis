import hashlib
import json
from pathlib import Path

from .contracts import InstalledPublicationPackage


def catalog_of(package: InstalledPublicationPackage) -> dict:
    raw = package.catalog_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != package.component_manifest_hash:
        raise ValueError("publication_catalog_digest")
    catalog = json.loads(raw)
    if catalog["schemaVersion"] != 1 or catalog["engine"]["commit"] != package.engine_commit:
        raise ValueError("publication_catalog_engine")
    for definition in catalog["definitions"]:
        for source in [definition["source"], *definition["sourceDependencies"]]:
            source_bytes(package, source)
    return catalog


def source_bytes(package: InstalledPublicationPackage, source: dict) -> bytes:
    roots = {"trellis": package.trellis_root, "engine": package.engine_root}
    root = roots[source["root"]].resolve()
    relative = Path(source["path"])
    path = (root / relative).resolve()
    if relative.is_absolute() or not path.is_relative_to(root):
        raise ValueError("publication_source_path")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("publication_component_digest")
    return raw
