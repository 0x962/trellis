import argparse
import difflib
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("engine_source", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
parts = []
for path in sorted((root / "files").rglob("*.py")):
    relative = path.relative_to(root / "files").as_posix()
    lines = path.read_text().splitlines(keepends=True)
    parts.append(f"diff --git a/{relative} b/{relative}\nnew file mode 100644\n")
    if lines:
        parts.extend(difflib.unified_diff([], lines, fromfile="/dev/null", tofile=f"b/{relative}"))
    else:
        parts.append("index 0000000..e69de29\n")
relative = "src/backend/base/langflow/api/router.py"
before = (args.engine_source / relative).read_text()
after = before.replace("router_v1.include_router(chat_router)",
    "from langflow.api.v1.trellis_publications import router as trellis_publications_router\n\n"
    "router_v1.include_router(trellis_publications_router)\nrouter_v1.include_router(chat_router)")
if after == before:
    raise ValueError("publication_router_seam_missing")
parts.append(f"diff --git a/{relative} b/{relative}\n")
parts.extend(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
                               fromfile=f"a/{relative}", tofile=f"b/{relative}"))
(root / "0001-immutable-publications.patch").write_text("".join("-\n+\n" if line == " \n" else line for line in "".join(parts).splitlines(keepends=True)))
