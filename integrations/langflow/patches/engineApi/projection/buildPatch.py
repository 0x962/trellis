import difflib
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
parts = []
files = {}
for source in sorted((root / "source").glob("*.py")):
    target = f"src/backend/base/langflow/services/trellis_v1/{source.name}"
    content = source.read_bytes()
    files[target] = hashlib.sha256(content).hexdigest()
    parts.append(f"diff --git a/{target} b/{target}\nnew file mode 100644\n--- /dev/null\n+++ b/{target}\n")
    parts.extend(list(difflib.unified_diff([], content.decode().splitlines(keepends=True)))[2:])
patch = "".join(parts).encode()
patch_name = "0001-projection-checkpoints.patch"
(root / patch_name).write_bytes(patch)
(root / "manifest.json").write_text(json.dumps({
    "upstream": "fec71dca901949c09ed4d63315804337cd2eb13d",
    "patch": patch_name,
    "sha256": hashlib.sha256(patch).hexdigest(),
    "files": files,
    "tests": {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in sorted((root / "tests").glob("*.py"))},
}, indent=2) + "\n")
