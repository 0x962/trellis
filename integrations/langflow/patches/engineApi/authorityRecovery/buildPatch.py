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


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError("authority recovery startup source did not match the pinned checkpoint")
    return source.replace(old, new, 1)


migration = "ae2b4f7d509c_add_trellis_authority_recoveries.py"
add_file(root / "source" / migration, f"src/backend/base/langflow/alembic/versions/{migration}")
for name in [
    "authority_recovery_models.py",
    "authority_recovery_validation.py",
    "authority_recovery_store.py",
    "authority_recovery_router.py",
]:
    add_file(root / "source" / name, f"{service_root}/{name}")

startup_target = f"{service_root}/startup.py"
startup_before = (patches / "engineApi" / "reviewStartup" / "source" / "startup.py").read_text()
startup_after = replace_once(
    startup_before,
    "    from langflow.services.trellis_v1.admission_service import AdmissionService\n",
    "    from langflow.services.trellis_v1.admission_service import AdmissionService\n"
    "    from langflow.services.trellis_v1.authority_recovery_router import create_authority_recovery_router\n",
)
startup_after = replace_once(
    startup_after,
    "    capture_issuer_file = Path(os.environ[\"TRELLIS_CAPTURE_ISSUER_FILE\"])\n",
    "    capture_issuer_file = Path(os.environ[\"TRELLIS_CAPTURE_ISSUER_FILE\"])\n"
    "    authority_recovery_issuer_file = Path(os.environ[\"TRELLIS_AUTHORITY_RECOVERY_ISSUER_FILE\"])\n",
)
startup_after = replace_once(
    startup_after,
    "        create_decision_router(security=security, execution_service=background),\n",
    "        create_decision_router(security=security, execution_service=background),\n"
    "        create_authority_recovery_router(\n"
    "            security=security,\n"
    "            open_session=session_scope,\n"
    "            issuer_file=authority_recovery_issuer_file,\n"
    "        ),\n",
)
(root / "source" / "startup.py").write_text(startup_after)
files[startup_target] = hashlib.sha256(startup_after.encode()).hexdigest()
parts.append(f"diff --git a/{startup_target} b/{startup_target}\n--- a/{startup_target}\n+++ b/{startup_target}\n")
parts.extend(
    list(
        difflib.unified_diff(
            startup_before.splitlines(keepends=True),
            startup_after.splitlines(keepends=True),
            fromfile=f"a/{startup_target}",
            tofile=f"b/{startup_target}",
            n=0,
        )
    )[2:]
)

patch = "".join(parts).encode()
patch_name = "0002-recover-initial-authority.patch"
(root / patch_name).write_bytes(patch)
tests = {
    path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
    for path in sorted((root / "tests").glob("*.py"))
}
(root / "manifest.json").write_text(
    json.dumps(
        {
            "upstream": upstream,
            "after": "9d1a3e6c4f8b",
            "migration": "ae2b4f7d509c",
            "patch": patch_name,
            "sha256": hashlib.sha256(patch).hexdigest(),
            "startupBase": {
                "path": "integrations/langflow/patches/engineApi/reviewStartup/source/startup.py",
                "sha256": hashlib.sha256(startup_before.encode()).hexdigest(),
            },
            "files": files,
            "tests": tests,
            "requires": [
                "the shared engine API fragment and migration 9d1a3e6c4f8b",
                "the current explicit private engine API startup fragment",
                "TRELLIS_AUTHORITY_RECOVERY_ISSUER_FILE from host composition",
                "AuthorityLifecycle.recoverInitial from the Trellis host",
                "the review and reconciliation startup hunks during final assembly",
            ],
        },
        indent="\t",
    )
    + "\n"
)
