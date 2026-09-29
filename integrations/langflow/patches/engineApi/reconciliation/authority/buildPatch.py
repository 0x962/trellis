import difflib
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
reconciliation = root.parent
upstream = "fec71dca901949c09ed4d63315804337cd2eb13d"
service_root = "src/backend/base/langflow/services/trellis_v1"
base_hashes = {
    "capture_boundary.py": "f28fd4df9d7379891f39b64ccf5cb8ab9bb909dd3a03b7f12b70b3db6d229ab2",
    "reconciliation_reader.py": "b00ac6334ef180fb7b0001096c11844f50bc84c54d0f0429c6df82f348d3bca0",
    "reconciliation_router.py": "64d4d1777a043f7131f0e3b4b39f75efc382f761523c19135b1a730ffa47b794",
}


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError("reconciliation authority source did not match the pinned checkpoint")
    return source.replace(old, new, 1)


def read_base(name: str) -> str:
    source = reconciliation / "source" / name
    content = source.read_bytes()
    if hashlib.sha256(content).hexdigest() != base_hashes[name]:
        raise RuntimeError(f"reconciliation authority base digest did not match for {name}")
    return content.decode()


before = {name: read_base(name) for name in base_hashes}
after = dict(before)

after["reconciliation_reader.py"] = replace_once(
    after["reconciliation_reader.py"],
    "import sqlite3\nfrom pathlib import Path\n",
    "import sqlite3\nfrom datetime import datetime, timezone\nfrom pathlib import Path\nfrom uuid import UUID\n",
)
after["reconciliation_reader.py"] = replace_once(
    after["reconciliation_reader.py"],
    "from langflow.services.trellis_v1.capture_grants import CaptureIdentity\n",
    "from langflow.services.trellis_v1.authority import parse_authority\n"
    "from langflow.services.trellis_v1.capture_grants import CaptureIdentity\n",
)
after["reconciliation_reader.py"] = replace_once(
    after["reconciliation_reader.py"],
    "    def read(self, *, checkpoint: bool) -> LiveEngineIdentity:\n",
    "    @staticmethod\n"
    "    def _authority(path: Path, execution_id: str) -> dict[str, object] | None:\n"
    "        with sqlite3.connect(f\"{path.as_uri()}?mode=ro\", uri=True) as connection:\n"
    "            connection.row_factory = sqlite3.Row\n"
    "            row = connection.execute(\n"
    "                \"SELECT authority_bytes, authority_digest, publication_id, engine_job_id, \"\n"
    "                \"engine_epoch, host_id, owner_id, ownership_revision, capability_id, \"\n"
    "                \"expires_at, revoked_at FROM trellis_delivery_authorities WHERE execution_id=?\",\n"
    "                (execution_id,),\n"
    "            ).fetchone()\n"
    "        if row is None:\n"
    "            return None\n"
    "        authority_bytes = bytes(row[\"authority_bytes\"])\n"
    "        binding = parse_authority(authority_bytes)\n"
    "        authority = binding.authority\n"
    "        expires_at = datetime.fromisoformat(row[\"expires_at\"])\n"
    "        stored_expires_at = (\n"
    "            expires_at if expires_at.tzinfo is not None else expires_at.replace(tzinfo=timezone.utc)\n"
    "        )\n"
    "        if (\n"
    "            binding.authority_digest != row[\"authority_digest\"]\n"
    "            or authority.execution_id != execution_id\n"
    "            or authority.publication_id != row[\"publication_id\"]\n"
    "            or authority.engine_job_id != UUID(row[\"engine_job_id\"])\n"
    "            or authority.engine_epoch != row[\"engine_epoch\"]\n"
    "            or authority.host_id != row[\"host_id\"]\n"
    "            or authority.owner_id != row[\"owner_id\"]\n"
    "            or authority.ownership_revision != row[\"ownership_revision\"]\n"
    "            or authority.capability_id != row[\"capability_id\"]\n"
    "            or authority.expires_at != stored_expires_at\n"
    "        ):\n"
    "            raise ReconciliationConflict(\"reconciliation_authority_conflict\")\n"
    "        revoked_at = (\n"
    "            datetime.fromisoformat(row[\"revoked_at\"]) if row[\"revoked_at\"] is not None else None\n"
    "        )\n"
    "        return {\n"
    "            \"authorityBytes\": authority_bytes.decode(),\n"
    "            \"authorityDigest\": binding.authority_digest,\n"
    "            \"authority\": authority.model_dump(by_alias=True, mode=\"json\"),\n"
    "            \"revokedAt\": revoked_at.isoformat() if revoked_at is not None else None,\n"
    "        }\n"
    "\n"
    "    def read_authority(self, execution_id: str) -> dict[str, object] | None:\n"
    "        return self._authority(self._database_path(), execution_id)\n"
    "\n"
    "    def read(self, *, checkpoint: bool) -> LiveEngineIdentity:\n",
)

after["capture_boundary.py"] = replace_once(
    after["capture_boundary.py"],
    "    async def release_reconciliation(self, lease_id: UUID, lease_bytes: str, acknowledgement_bytes: str):\n",
    "    async def read_reconciliation_authority(self, lease_id: UUID, execution_id: str, reader):\n"
    "        async with self._exclude(False):\n"
    "            if await self._capture_active() is not None:\n"
    "                raise ReconciliationConflict(\"capture_grant_active\")\n"
    "            record = await asyncio.to_thread(self.reconciliation_store.read, lease_id)\n"
    "            active = await self._reconciliation_active()\n"
    "            if record.state != \"active\" or active is None or active.leaseBytes != record.leaseBytes:\n"
    "                raise ReconciliationConflict(\"reconciliation_lease_not_active\")\n"
    "            return await asyncio.to_thread(reader.read_authority, execution_id)\n"
    "\n"
    "    async def release_reconciliation(self, lease_id: UUID, lease_bytes: str, acknowledgement_bytes: str):\n",
)

after["reconciliation_router.py"] = replace_once(
    after["reconciliation_router.py"],
    "    @router.post(\"/{lease_id}/release\", response_model=ReconciliationRecord)\n",
    "    @router.get(\"/{lease_id}/authorities/{execution_id}\")\n"
    "    async def read_authority(lease_id: UUID, execution_id: str):\n"
    "        try:\n"
    "            state = await boundary.read_reconciliation_authority(\n"
    "                lease_id, execution_id, reader\n"
    "            )\n"
    "        except ReconciliationMissing as error:\n"
    "            raise HTTPException(status_code=404, detail=str(error)) from error\n"
    "        except ReconciliationConflict as error:\n"
    "            raise HTTPException(status_code=409, detail=str(error)) from error\n"
    "        if state is None:\n"
    "            raise HTTPException(status_code=404, detail=\"engine_authority_not_found\")\n"
    "        return state\n"
    "\n"
    "    @router.post(\"/{lease_id}/release\", response_model=ReconciliationRecord)\n",
)

parts = []
files = {}
source_directory = root / "source"
source_directory.mkdir(exist_ok=True)
for name in sorted(after):
    target = f"{service_root}/{name}"
    result = after[name]
    (source_directory / name).write_text(result)
    files[target] = hashlib.sha256(result.encode()).hexdigest()
    parts.append(f"diff --git a/{target} b/{target}\n--- a/{target}\n+++ b/{target}\n")
    parts.extend(
        list(
            difflib.unified_diff(
                before[name].splitlines(keepends=True),
                result.splitlines(keepends=True),
                fromfile=f"a/{target}",
                tofile=f"b/{target}",
                n=0,
            )
        )[2:]
    )

patch = "".join(parts).encode()
patch_name = "0002-read-authority-under-lease.patch"
(root / patch_name).write_bytes(patch)
(root / "manifest.json").write_text(
    json.dumps(
        {
            "upstream": upstream,
            "patch": patch_name,
            "sha256": hashlib.sha256(patch).hexdigest(),
            "after": {
                "path": "integrations/langflow/patches/engineApi/reconciliation/0001-hold-engine-reconciliation-lease.patch",
                "sha256": "0a5a23b18a8c367ce81d8bd43333298bf551fed7d231b1778074985a20638fe4",
            },
            "baseFiles": base_hashes,
            "files": files,
            "requires": [
                "the configured SQLite engine database",
                "the shared capture-writers flock",
                "an exact active durable reconciliation lease",
                "the normal private engine bearer",
                "the reconciliation issuer credential",
            ],
        },
        indent=2,
    )
    + "\n"
)
