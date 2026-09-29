import difflib
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
repository = root.parents[3]
base = "63f3e77ef5aa96801ca880f42b2a3fa0d8d65176"
target = "src/backend/base/langflow/services/trellis_v1"
parts = []
sources = []
for name in ("occurrence_journal.py", "occurrence_requests.py", "occurrence_reservations.py", "occurrence_receipts.py"):
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
patch = root / "0005-retained-wait-lookup.patch"
patch.write_text("".join(parts))
manifest = {"schemaVersion": 1, "upstream": "fec71dca901949c09ed4d63315804337cd2eb13d",
            "requires": [{"patch": "0004-durable-cancellation-guard.patch",
                          "sha256": hashlib.sha256((root / "0004-durable-cancellation-guard.patch").read_bytes()).hexdigest()}],
            "patch": "integrations/langflow/patches/occurrenceRequests/" + patch.name,
            "sha256": hashlib.sha256(patch.read_bytes()).hexdigest(), "sources": sources,
            "qualification": "source-only", "runtimeAccepted": False}
(root / "retained-wait-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
