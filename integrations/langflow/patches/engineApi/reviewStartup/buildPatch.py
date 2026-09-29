import difflib
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
patches = root.parents[1]
upstream = "fec71dca901949c09ed4d63315804337cd2eb13d"
target = "src/backend/base/langflow/services/trellis_v1/startup.py"


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError("review startup source did not match the pinned checkpoint")
    return source.replace(old, new, 1)


before = (patches / "engineApi" / "startup" / "source" / "startup.py").read_text()
after = replace_once(
    before,
    "def load_engine_api_startup_config() -> EngineApiStartupConfig | None:\n",
    "def _install_outgoing_transports(\n"
    "    config: EngineApiStartupConfig,\n"
    "    *,\n"
    "    install_request_transport,\n"
    "    install_review_gate_transport,\n"
    ") -> None:\n"
    "    origin = str(config.native_reservation_origin).removesuffix(\"/\")\n"
    "    authentication_file = _private_file(config.native_reservation_authentication_file)\n"
    "    install_request_transport(origin=origin, authentication_file=authentication_file)\n"
    "    install_review_gate_transport(origin=origin, authentication_file=authentication_file)\n"
    "\n"
    "\n"
    "def load_engine_api_startup_config() -> EngineApiStartupConfig | None:\n",
)
after = replace_once(
    after,
    "    from langflow.services.trellis_v1.occurrence_transport import install_request_transport\n",
    "    from langflow.services.trellis_v1.occurrence_transport import install_request_transport\n"
    "    from langflow.services.trellis_v1.review_gate_router import create_review_gate_router\n"
    "    from langflow.services.trellis_v1.review_gate_transport import install_review_gate_transport\n",
)
after = replace_once(
    after,
    "    install_request_transport(\n"
    "        origin=str(config.native_reservation_origin).removesuffix(\"/\"),\n"
    "        authentication_file=_private_file(config.native_reservation_authentication_file),\n"
    "    )\n",
    "    _install_outgoing_transports(\n"
    "        config,\n"
    "        install_request_transport=install_request_transport,\n"
    "        install_review_gate_transport=install_review_gate_transport,\n"
    "    )\n",
)
after = replace_once(
    after,
    "        create_projection_router(security=security, open_session=session_scope),\n",
    "        create_projection_router(security=security, open_session=session_scope),\n"
    "        create_review_gate_router(\n"
    "            jobs=jobs,\n"
    "            executor=background,\n"
    "            security=security,\n"
    "            open_session=session_scope,\n"
    "        ),\n",
)

source = root / "source" / "startup.py"
source.parent.mkdir(exist_ok=True)
source.write_text(after)
parts = [f"diff --git a/{target} b/{target}\n--- a/{target}\n+++ b/{target}\n"]
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
patch = "".join(parts).encode()
patch_name = "0001-register-review-gate-startup.patch"
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
            "files": {target: hashlib.sha256(after.encode()).hexdigest()},
            "tests": tests,
            "requires": [
                "langflow.services.trellis_v1.review_gate_router.create_review_gate_router",
                "langflow.services.trellis_v1.review_gate_transport.install_review_gate_transport",
                "the per-instance native reservation authentication file",
                "the explicit private engine API startup fragment",
            ],
        },
        indent=2,
    )
    + "\n"
)
