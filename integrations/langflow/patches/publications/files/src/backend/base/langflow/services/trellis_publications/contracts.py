import base64
import hashlib
import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PublicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    enginePackageDigest: str = Field(pattern=r"^[a-f0-9]{64}$")
    snapshot: dict[str, Any]
    sourceBytes: str

    def source(self) -> bytes:
        source = base64.b64decode(self.sourceBytes, validate=True)
        snapshot = self.snapshot
        if snapshot["engine"] != "langflow" or snapshot["schemaVersion"] != 1:
            raise ValueError("publication_document_format")
        if type(snapshot["revision"]) is not int or snapshot["revision"] < 1:
            raise ValueError("publication_revision")
        if snapshot["flow"]["version"] != snapshot["revision"]:
            raise ValueError("publication_revision")
        if hashlib.sha256(source).hexdigest() != snapshot["documentHash"]:
            raise ValueError("publication_document_hash")
        content = {key: snapshot[key] for key in ("engine", "schemaVersion", "graphDocument", "componentManifestHash")}
        if json.loads(source) != content:
            raise ValueError("publication_source_conflict")
        return source


class InstalledPublicationPackage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    engine_package_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    component_manifest_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    engine_commit: str = Field(pattern=r"^[a-f0-9]{40}$")
    catalog_path: Path
    trellis_root: Path
    engine_root: Path
    authentication_file: Path
    user_id: str
