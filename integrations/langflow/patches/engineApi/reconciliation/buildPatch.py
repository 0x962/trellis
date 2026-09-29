import difflib
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
patches = root.parents[1]
upstream = "fec71dca901949c09ed4d63315804337cd2eb13d"
service_root = "src/backend/base/langflow/services/trellis_v1"
parts = []
files = {}


def add_file(source: Path, target: str) -> None:
    content = source.read_bytes()
    files[target] = hashlib.sha256(content).hexdigest()
    parts.append(f"diff --git a/{target} b/{target}\nnew file mode 100644\n--- /dev/null\n+++ b/{target}\n")
    parts.extend(
        list(
            difflib.unified_diff(
                [],
                content.decode().splitlines(keepends=True),
                fromfile="/dev/null",
                tofile=f"b/{target}",
            )
        )[2:]
    )


def change_file(before: str, after: str, target: str) -> None:
    if after == before:
        raise RuntimeError(f"reconciliation patch did not change {target}")
    files[target] = hashlib.sha256(after.encode()).hexdigest()
    parts.append(f"diff --git a/{target} b/{target}\n--- a/{target}\n+++ b/{target}\n")
    parts.extend(
        list(
            difflib.unified_diff(
                before.splitlines(keepends=True),
                after.splitlines(keepends=True),
                fromfile=f"a/{target}",
                tofile=f"b/{target}",
                n=0,
            )
        )[2:]
    )


for name in [
    "reconciliation_models.py",
    "reconciliation_reader.py",
    "reconciliation_router.py",
    "reconciliation_store.py",
]:
    add_file(root / "source" / name, f"{service_root}/{name}")

capture_target = f"{service_root}/capture_boundary.py"
capture_before = (patches / "backup" / "source" / "capture_boundary.py").read_text()
capture_after = (root / "source" / "capture_boundary.py").read_text()
change_file(capture_before, capture_after, capture_target)

startup_target = f"{service_root}/startup.py"
startup_before = (patches / "engineApi" / "startup" / "source" / "startup.py").read_text()
startup_after = startup_before.replace(
    "import os\nimport stat\n",
    "import hashlib\nimport os\nimport stat\n",
    1,
).replace(
    "CAPTURE_DIRECTORY = Path(\"/data/config/trellis-capture\")\n",
    "CAPTURE_DIRECTORY = Path(\"/data/config/trellis-capture\")\n"
    "RECONCILIATION_DIRECTORY = Path(\"/data/config/trellis-reconciliation\")\n",
    1,
).replace(
    "    from langflow.services.trellis_v1.native_router import create_native_router\n",
    "    from langflow.services.trellis_v1.native_router import create_native_router\n"
    "    from langflow.services.trellis_v1.reconciliation_reader import LiveIdentityReader\n"
    "    from langflow.services.trellis_v1.reconciliation_router import create_reconciliation_router\n"
    "    from langflow.services.trellis_v1.reconciliation_store import ReconciliationLeaseStore\n",
    1,
).replace(
    "    store = CaptureGrantStore(\n"
    "        _private_directory(CAPTURE_DIRECTORY),\n"
    "        CaptureIdentity(\n"
    "            dataHomeId=identity.data_home_id,\n"
    "            hostId=identity.host_id,\n"
    "            ownerId=identity.owner_id,\n"
    "            instanceId=identity.instance_id,\n"
    "            manifestDigest=identity.manifest_digest,\n"
    "        ),\n"
    "    )\n"
    "    boundary = CaptureBoundary(store)\n",
    "    runtime_identity = CaptureIdentity(\n"
    "        dataHomeId=identity.data_home_id,\n"
    "        hostId=identity.host_id,\n"
    "        ownerId=identity.owner_id,\n"
    "        instanceId=identity.instance_id,\n"
    "        manifestDigest=identity.manifest_digest,\n"
    "    )\n"
    "    store = CaptureGrantStore(_private_directory(CAPTURE_DIRECTORY), runtime_identity)\n"
    "    reconciliation_issuer_file = _private_file(Path(os.environ[\"TRELLIS_RECONCILIATION_ISSUER_FILE\"]))\n"
    "    reconciliation_issuer_digest = hashlib.sha256(reconciliation_issuer_file.read_bytes()).hexdigest()\n"
    "    reconciliation_store = ReconciliationLeaseStore(\n"
    "        _private_directory(RECONCILIATION_DIRECTORY),\n"
    "        runtime_identity,\n"
    "        reconciliation_issuer_digest,\n"
    "    )\n"
    "    boundary = CaptureBoundary(store, reconciliation_store)\n",
    1,
).replace(
    "    publication = _package(config)\n"
    "    capture_authority = _CaptureAuthorityBoundary(boundary, background.resume_after_capture)\n",
    "    publication = _package(config)\n"
    "    engine_config_file = _private_file(Path(os.environ[CONFIG_ENV]))\n"
    "    reconciliation_reader = LiveIdentityReader(\n"
    "        database=database,\n"
    "        settings=settings,\n"
    "        runtime_identity=runtime_identity,\n"
    "        engine_package_digest=config.engine_package_digest,\n"
    "        component_manifest_hash=config.component_manifest_hash,\n"
    "        engine_commit=config.engine_commit,\n"
    "        engine_config_file=engine_config_file,\n"
    "    )\n"
    "    capture_authority = _CaptureAuthorityBoundary(boundary, background.resume_after_capture)\n",
    1,
).replace(
    "        create_capture_authority_router(boundary=capture_authority, issuer_file=capture_issuer_file),\n",
    "        create_capture_authority_router(boundary=capture_authority, issuer_file=capture_issuer_file),\n"
    "        create_reconciliation_router(\n"
    "            boundary=boundary,\n"
    "            reader=reconciliation_reader,\n"
    "            issuer_file=reconciliation_issuer_file,\n"
    "            after_release=background.resume_after_capture,\n"
    "        ),\n",
    1,
)
change_file(startup_before, startup_after, startup_target)

patch = "".join(parts).encode()
patch_name = "0001-hold-engine-reconciliation-lease.patch"
(root / patch_name).write_bytes(patch)
tests = {
    path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
    for path in sorted((root / "tests").glob("*.py"))
}
(root / "manifest.json").write_text(
    json.dumps(
        {
            "upstream": upstream,
            "patch": patch_name,
            "sha256": hashlib.sha256(patch).hexdigest(),
            "files": files,
            "tests": tests,
            "requires": [
                "CaptureBoundary and CaptureGrantStore from the backup fragment",
                "install_capture_boundary from the capture writer fragment",
                "the explicit private engine API startup fragment",
                "BackgroundExecutionService.resume_after_capture",
                "TRELLIS_RECONCILIATION_ISSUER_FILE from host composition",
            ],
        },
        indent=2,
    )
    + "\n"
)
