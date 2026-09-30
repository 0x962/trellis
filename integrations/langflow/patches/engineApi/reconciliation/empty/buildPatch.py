import difflib
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
authority = root.parent / "authority"
upstream = "fec71dca901949c09ed4d63315804337cd2eb13d"
service_root = "src/backend/base/langflow/services/trellis_v1"
base_hashes = {
    "capture_boundary.py": "b8b3b4f664f5dac4d44bb28bb1763fdc42174cda52aa40bf0c822fdb8675b540",
    "reconciliation_reader.py": "61ded40d3e7d73627760992ed9084f28224abe2be3a63f20e3d7c40f283436f6",
    "reconciliation_router.py": "aa685314f90b977ad49d8e090e6b6a8654d6a16014d7bef30db130a35fbd3870",
}


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError("reconciliation empty source did not match the authority reader checkpoint")
    return source.replace(old, new, 1)


def read_base(name: str) -> str:
    source = authority / "source" / name
    content = source.read_bytes()
    if hashlib.sha256(content).hexdigest() != base_hashes[name]:
        raise RuntimeError(f"reconciliation empty base digest did not match for {name}")
    return content.decode()


before = {name: read_base(name) for name in base_hashes}
after = dict(before)

after["reconciliation_reader.py"] = replace_once(
    after["reconciliation_reader.py"],
    "    def read_authority(self, execution_id: str) -> dict[str, object] | None:\n"
    "        return self._authority(self._database_path(), execution_id)\n"
    "\n"
    "    def read(self, *, checkpoint: bool) -> LiveEngineIdentity:\n",
    "    def read_authority(self, execution_id: str) -> dict[str, object] | None:\n"
    "        return self._authority(self._database_path(), execution_id)\n"
    "\n"
    "    @staticmethod\n"
    "    def _empty(path: Path) -> dict[str, bool]:\n"
    "        with sqlite3.connect(f\"{path.as_uri()}?mode=ro\", uri=True) as connection:\n"
    "            retained = connection.execute(\n"
    "                \"SELECT EXISTS(SELECT 1 FROM job LIMIT 1) \"\n"
    "                \"OR EXISTS(SELECT 1 FROM trellis_delivery_authorities LIMIT 1) \"\n"
    "                \"OR EXISTS(SELECT 1 FROM trellis_job_correlations LIMIT 1) \"\n"
    "                \"OR EXISTS(SELECT 1 FROM trellis_decision_enqueue_obligations_v1 \"\n"
    "                \"WHERE consumed_at IS NULL LIMIT 1) \"\n"
    "                \"OR EXISTS(SELECT 1 FROM job_checkpoints WHERE \"\n"
    "                \"kind LIKE 'trellis-%obligation-v1:%' \"\n"
    "                \"OR kind LIKE 'trellis-continuation-v1:%' LIMIT 1) \"\n"
    "                \"OR EXISTS(SELECT 1 FROM execution_signals \"\n"
    "                \"WHERE consumed_at IS NULL LIMIT 1)\"\n"
    "            ).fetchone()[0]\n"
    "        return {\"empty\": not bool(retained)}\n"
    "\n"
    "    def read_empty(self) -> dict[str, bool]:\n"
    "        return self._empty(self._database_path())\n"
    "\n"
    "    def read(self, *, checkpoint: bool) -> LiveEngineIdentity:\n",
)

after["capture_boundary.py"] = replace_once(
    after["capture_boundary.py"],
    "    async def release_reconciliation(self, lease_id: UUID, lease_bytes: str, acknowledgement_bytes: str):\n",
    "    async def read_reconciliation_empty(self, lease_id: UUID, reader):\n"
    "        async with self._exclude(False):\n"
    "            if await self._capture_active() is not None:\n"
    "                raise ReconciliationConflict(\"capture_grant_active\")\n"
    "            record = await asyncio.to_thread(self.reconciliation_store.read, lease_id)\n"
    "            active = await self._reconciliation_active()\n"
    "            if record.state != \"active\" or active is None or active.leaseBytes != record.leaseBytes:\n"
    "                raise ReconciliationConflict(\"reconciliation_lease_not_active\")\n"
    "            return await asyncio.to_thread(reader.read_empty)\n"
    "\n"
    "    async def release_reconciliation(self, lease_id: UUID, lease_bytes: str, acknowledgement_bytes: str):\n",
)

after["reconciliation_router.py"] = replace_once(
    after["reconciliation_router.py"],
    "    @router.post(\"/{lease_id}/release\", response_model=ReconciliationRecord)\n",
    "    @router.get(\"/{lease_id}/empty\")\n"
    "    async def read_empty(lease_id: UUID):\n"
    "        try:\n"
    "            return await boundary.read_reconciliation_empty(lease_id, reader)\n"
    "        except ReconciliationMissing as error:\n"
    "            raise HTTPException(status_code=404, detail=str(error)) from error\n"
    "        except ReconciliationConflict as error:\n"
    "            raise HTTPException(status_code=409, detail=str(error)) from error\n"
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
patch_name = "0003-read-empty-under-lease.patch"
(root / patch_name).write_bytes(patch)
(root / "manifest.json").write_text(
    json.dumps(
        {
            "upstream": upstream,
            "patch": patch_name,
            "sha256": hashlib.sha256(patch).hexdigest(),
            "after": {
                "path": "integrations/langflow/patches/engineApi/reconciliation/authority/0002-read-authority-under-lease.patch",
                "sha256": "7c8abf00c49127a996e35f4dc45ad94a5e4b1bb6367072a85b698865b11a3cca",
            },
            "baseFiles": base_hashes,
            "files": files,
            "requires": [
                "the configured SQLite engine database",
                "the shared capture-writers flock",
                "an exact active durable reconciliation lease",
                "the job, authority, correlation, checkpoint, signal, and decision obligation tables",
                "the normal private engine bearer",
                "the reconciliation issuer credential",
            ],
        },
        indent=2,
    )
    + "\n"
)
