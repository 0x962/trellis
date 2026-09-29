import difflib
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
target = "src/backend/base/langflow/services/trellis_v1"
parts = []
sources = []
for path in sorted((root / "source").glob("*.py")):
    relative = f"{target}/{path.name}"
    data = path.read_bytes()
    parts.append(f"diff --git a/{relative} b/{relative}\nnew file mode 100644\n")
    parts.extend(difflib.unified_diff([], data.decode().splitlines(keepends=True),
                                    fromfile="/dev/null", tofile=f"b/{relative}"))
    sources.append({"source": f"source/{path.name}", "target": relative,
                    "sha256": hashlib.sha256(data).hexdigest()})
patch = root / "0001-engine-occurrence-requests.patch"
patch.write_text("".join(parts))
manifest = {"schemaVersion": 1, "upstream": "fec71dca901949c09ed4d63315804337cd2eb13d",
            "patch": "integrations/langflow/patches/occurrenceRequests/" + patch.name,
            "sha256": hashlib.sha256(patch.read_bytes()).hexdigest(), "sources": sources,
            "qualification": "source-only", "runtimeAccepted": False}
(root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
