import difflib
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
repository = root.parents[3]
base = "5708f0e58bdb84c81abc61dcb81138941efc6cdb"
target = "src/backend/base/langflow/services/trellis_v1"
parts = []
sources = []
for name in ("occurrence_scope.py",):
    path = root / "source" / name
    data = path.read_bytes()
    relative = f"{target}/{name}"
    old = subprocess.check_output(
        ["git", "show", f"{base}:{path.relative_to(repository)}"], cwd=repository,
    ).decode().splitlines(keepends=True)
    parts.append(f"diff --git a/{relative} b/{relative}\n")
    if not old:
        parts.append("new file mode 100644\n")
    parts.extend(difflib.unified_diff(old, data.decode().splitlines(keepends=True),
                                    fromfile=f"a/{relative}" if old else "/dev/null", tofile=f"b/{relative}"))
    sources.append({"source": f"source/{name}", "target": relative,
                    "sha256": hashlib.sha256(data).hexdigest()})
patch = root / "0007-loop-scope-inputs.patch"
patch.write_text("".join(parts))
manifest = {"schemaVersion": 1, "upstream": "fec71dca901949c09ed4d63315804337cd2eb13d",
            "requires": [{"patch": "0006-occurrence-projection-writes.patch",
                          "sha256": hashlib.sha256((root / "0006-occurrence-projection-writes.patch").read_bytes()).hexdigest()}],
            "patch": "integrations/langflow/patches/occurrenceRequests/" + patch.name,
            "sha256": hashlib.sha256(patch.read_bytes()).hexdigest(), "sources": sources,
            "qualification": "source-only", "runtimeAccepted": False}
(root / "loop-inputs-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
