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

for source in sorted((root / "source").glob("*.py")):
    if source.name.startswith("9d1a3e6c4f8b_"):
        target = f"src/backend/base/langflow/alembic/versions/{source.name}"
    else:
        target = f"src/backend/base/langflow/services/trellis_v1/{source.name}"
    content = source.read_bytes()
    files[target] = hashlib.sha256(content).hexdigest()
    lines = content.decode().splitlines(keepends=True)
    parts.append(f"diff --git a/{target} b/{target}\nnew file mode 100644\n--- /dev/null\n+++ b/{target}\n")
    parts.extend(list(difflib.unified_diff([], lines, fromfile="/dev/null", tofile=f"b/{target}"))[2:])

auth_target = "src/lfx/src/lfx/services/settings/auth.py"
auth_path = args.engine_source / auth_target
before = auth_path.read_text()
after = before.replace(
    "    CONFIG_DIR: str\n    SECRET_KEY: SecretStr = Field(\n",
    "    CONFIG_DIR: str\n    SECRET_KEY_FILE: str = \"\"\n    SECRET_KEY: SecretStr = Field(\n",
    1,
).replace(
    "        config_dir = info.data.get(\"CONFIG_DIR\")\n\n        if not config_dir:\n",
    "        config_dir = info.data.get(\"CONFIG_DIR\")\n"
    "        secret_key_file = info.data.get(\"SECRET_KEY_FILE\")\n\n"
    "        if secret_key_file:\n"
    "            if value:\n"
    "                raise ValueError(\"SECRET_KEY and SECRET_KEY_FILE cannot both be set\")\n"
    "            value = read_secret_from_file(Path(secret_key_file))\n"
    "            if not value:\n"
    "                raise ValueError(\"SECRET_KEY_FILE is empty\")\n"
    "            _warn_if_secret_key_is_short(value)\n"
    "            return value\n"
    "        if not config_dir:\n",
    1,
)
if after == before:
    raise RuntimeError("secret file patch did not match the pinned source")
files[auth_target] = hashlib.sha256(after.encode()).hexdigest()
parts.append(f"diff --git a/{auth_target} b/{auth_target}\n--- a/{auth_target}\n+++ b/{auth_target}\n")
parts.extend(
    list(difflib.unified_diff(
        before.splitlines(keepends=True),
        after.splitlines(keepends=True),
        fromfile=f"a/{auth_target}",
        tofile=f"b/{auth_target}",
    ))[2:]
)

patch = "".join(parts).encode()
patch_name = "0001-shared-engine-api.patch"
(root / patch_name).write_bytes(patch)
tests = {
    path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
    for path in sorted((root / "tests").glob("*.py"))
}
(root / "manifest.json").write_text(
    json.dumps(
        {
            "upstream": upstream,
            "after": "8c0f2d5b3e7a",
            "migration": "9d1a3e6c4f8b",
            "patch": patch_name,
            "sha256": hashlib.sha256(patch).hexdigest(),
            "files": files,
            "tests": tests,
        },
        indent=2,
    )
    + "\n"
)
