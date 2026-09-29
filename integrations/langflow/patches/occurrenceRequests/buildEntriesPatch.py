import difflib
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
target = "src/backend/base/langflow/services/trellis_v1"
baseline = {}
name = None
for line in (root / "0001-engine-occurrence-requests.patch").read_text().splitlines(keepends=True):
    if line.startswith("+++ b/"):
        name = line.strip().rsplit("/", 1)[1]
        baseline[name] = []
    elif name is not None and line.startswith("+") and not line.startswith("+++"):
        baseline[name].append(line[1:])
parts = []
sources = []
for path in sorted((root / "source").glob("*.py")):
    relative = f"{target}/{path.name}"
    data = path.read_bytes()
    old = baseline.get(path.name, [])
    new = data.decode().splitlines(keepends=True)
    sources.append({"source": f"source/{path.name}", "target": relative,
                    "sha256": hashlib.sha256(data).hexdigest()})
    if old == new:
        continue
    parts.append(f"diff --git a/{relative} b/{relative}\n")
    if path.name not in baseline:
        parts.append("new file mode 100644\n")
    parts.extend(difflib.unified_diff(old, new, fromfile=f"a/{relative}" if old else "/dev/null",
                                    tofile=f"b/{relative}"))
patch = root / "0002-component-entry-receipts.patch"
patch.write_text("".join(parts))
manifest = {"schemaVersion": 1, "upstream": "fec71dca901949c09ed4d63315804337cd2eb13d",
            "requires": [{"patch": "0001-engine-occurrence-requests.patch",
                          "sha256": hashlib.sha256((root / "0001-engine-occurrence-requests.patch").read_bytes()).hexdigest()}],
            "patch": "integrations/langflow/patches/occurrenceRequests/" + patch.name,
            "sha256": hashlib.sha256(patch.read_bytes()).hexdigest(), "sources": sources,
            "qualification": "source-only", "runtimeAccepted": False}
(root / "entries-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
