import argparse
import difflib
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("engine_source", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
upstream = "fec71dca901949c09ed4d63315804337cd2eb13d"
parts = []
files = {}

source = root / "source" / "startup.py"
target = "src/backend/base/langflow/services/trellis_v1/startup.py"
content = source.read_bytes()
files[target] = hashlib.sha256(content).hexdigest()
parts.append(f"diff --git a/{target} b/{target}\nnew file mode 100644\n--- /dev/null\n+++ b/{target}\n")
parts.extend(list(difflib.unified_diff([], content.decode().splitlines(keepends=True),
                                      fromfile="/dev/null", tofile=f"b/{target}"))[2:])

main_target = "src/backend/base/langflow/main.py"
main_path = args.engine_source / main_target
before = main_path.read_text()
after = before.replace(
    "            await initialize_services(fix_migration=fix_migration)\n"
    "            await initialize_environment_variables()\n",
    "            await initialize_services(fix_migration=fix_migration)\n"
    "            from langflow.services.trellis_v1.startup import start_engine_api\n\n"
    "            await start_engine_api(_app)\n"
    "            await initialize_environment_variables()\n",
    1,
).replace(
    "    app.add_middleware(\n        ContentSizeLimitMiddleware,\n",
    "    from langflow.services.trellis_v1.startup import configure_engine_api\n\n"
    "    configure_engine_api(app)\n"
    "    app.add_middleware(\n        ContentSizeLimitMiddleware,\n",
    1,
)
if after == before:
    raise RuntimeError("startup patch did not match the pinned source")
files[main_target] = hashlib.sha256(after.encode()).hexdigest()
parts.append(f"diff --git a/{main_target} b/{main_target}\n--- a/{main_target}\n+++ b/{main_target}\n")
parts.extend(list(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
                                      fromfile=f"a/{main_target}", tofile=f"b/{main_target}"))[2:])

patch = "".join(parts).encode()
patch_name = "0001-register-private-engine-api.patch"
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
                "langflow.services.trellis_v1.capture_writer.install_capture_boundary",
                "langflow.services.trellis_v1.occurrence_transport.install_request_transport",
                "BackgroundExecutionService.resume_after_capture",
                "all private domain router fragments",
            ],
        },
        indent=2,
    )
    + "\n"
)
