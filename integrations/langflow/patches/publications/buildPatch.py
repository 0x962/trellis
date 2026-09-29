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
(root / "0001-immutable-publications.patch").write_text("".join("-\n+\n" if line == " \n" else line for line in "".join(parts).splitlines(keepends=True)))
