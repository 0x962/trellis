import difflib
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
patches = root.parents[1]
upstream = "fec71dca901949c09ed4d63315804337cd2eb13d"
target = "src/backend/base/langflow/services/trellis_v1/startup.py"
base_path = patches / "engineApi" / "reviewStartup" / "source" / "startup.py"
base_sha256 = "b9feda30eeac7e8d97f6d16f70f3af2848ecac6ef73f863167f8e1d3bf1bc15a"


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError("group startup source did not match the review startup checkpoint")
    return source.replace(old, new, 1)


before_bytes = base_path.read_bytes()
if hashlib.sha256(before_bytes).hexdigest() != base_sha256:
    raise RuntimeError("group startup base digest did not match the review startup checkpoint")
before = before_bytes.decode()
after = replace_once(
    before,
    "    install_request_transport,\n"
    "    install_review_gate_transport,\n",
    "    install_group_deadline_transport,\n"
    "    install_request_transport,\n"
    "    install_review_gate_transport,\n",
)
after = replace_once(
    after,
    "    install_request_transport(origin=origin, authentication_file=authentication_file)\n"
    "    install_review_gate_transport(origin=origin, authentication_file=authentication_file)\n",
    "    install_request_transport(origin=origin, authentication_file=authentication_file)\n"
    "    install_group_deadline_transport(origin=origin, authentication_file=authentication_file)\n"
    "    install_review_gate_transport(origin=origin, authentication_file=authentication_file)\n",
)
after = replace_once(
    after,
    "    from langflow.services.trellis_v1.native_router import create_native_router\n",
    "    from langflow.services.trellis_v1.group_scope_deadline import install_group_deadline_transport\n"
    "    from langflow.services.trellis_v1.group_scope_reader import create_group_scope_router\n"
    "    from langflow.services.trellis_v1.native_router import create_native_router\n",
)
after = replace_once(
    after,
    "        install_request_transport=install_request_transport,\n"
    "        install_review_gate_transport=install_review_gate_transport,\n",
    "        install_group_deadline_transport=install_group_deadline_transport,\n"
    "        install_request_transport=install_request_transport,\n"
    "        install_review_gate_transport=install_review_gate_transport,\n",
)
after = replace_once(
    after,
    "        create_projection_router(security=security, open_session=session_scope),\n",
    "        create_projection_router(security=security, open_session=session_scope),\n"
    "        create_group_scope_router(security=security, open_session=session_scope),\n",
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
patch_name = "0001-register-group-scope-startup.patch"
(root / patch_name).write_bytes(patch)
(root / "manifest.json").write_text(
    json.dumps(
        {
            "upstream": upstream,
            "patch": patch_name,
            "sha256": hashlib.sha256(patch).hexdigest(),
            "startupBase": {
                "path": base_path.relative_to(patches.parents[2]).as_posix(),
                "sha256": base_sha256,
            },
            "files": {target: hashlib.sha256(after.encode()).hexdigest()},
            "requires": [
                "integrations/langflow/patches/groupScopes/0001-executable-group-scopes.patch",
                "langflow.services.trellis_v1.group_scope_reader.create_group_scope_router",
                "langflow.services.trellis_v1.group_scope_deadline.install_group_deadline_transport",
                "the per-instance native reservation origin and authentication file",
                "the published review startup fragment",
                "the actual group deadline host callback",
            ],
        },
        indent=2,
    )
    + "\n"
)
