import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
parts = []
files = {}
for source in sorted((root / "source").glob("*.py")):
    content = source.read_bytes()
    target = f"src/backend/base/langflow/services/trellis_v1/{source.name}"
    files[target] = hashlib.sha256(content).hexdigest()
    lines = content.decode("utf-8").splitlines(keepends=True)
    parts.append(f"diff --git a/{target} b/{target}\nnew file mode 100644\n--- /dev/null\n+++ b/{target}\n@@ -0,0 +1,{len(lines)} @@\n")
    parts.extend("+" + line for line in lines)
patch = "".join(parts).encode("utf-8")
name = "0001-private-admission-routes.patch"
(root / name).write_bytes(patch)
(root / "manifest.json").write_text(json.dumps({
    "upstream": "fec71dca901949c09ed4d63315804337cd2eb13d",
    "patch": name,
    "sha256": hashlib.sha256(patch).hexdigest(),
    "files": files,
}, indent=2) + "\n")
