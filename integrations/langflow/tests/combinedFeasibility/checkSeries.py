import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


def digest(value):
    return hashlib.sha256(value).hexdigest()


def git_file(directory, revision, path):
    return subprocess.check_output(["git", "-C", str(directory), "show", f"{revision}:{path}"])


def file_sections(patch):
    return patch.split("diff --git ")[1:]


def added_source(patch, target):
    section = next(value for value in file_sections(patch) if value.startswith(f"a/{target} "))
    return "".join(
        line[1:] for line in section.splitlines(keepends=True)
        if line.startswith("+") and not line.startswith("+++")
    ).encode()


def apply_patch(files, patch, directory, engine, revision):
    for section in file_sections(patch):
        lines = section.splitlines(keepends=True)
        path = lines[0].rstrip().split(" b/", 1)[1]
        target = str(Path(directory) / path) if directory != "." else path
        new_file = any(line.startswith("new file mode ") for line in lines)
        if target not in files:
            files[target] = b"" if new_file else git_file(engine, revision, target)
        elif new_file:
            raise ValueError(f"Duplicate file: {target}")
        content = files[target].decode().splitlines(keepends=True)
        index = 1
        offset = 0
        previous_end = 0
        while index < len(lines):
            header = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", lines[index])
            if header is None:
                index += 1
                continue
            old_start, old_count, _, new_count = header.groups()
            old_count = int(old_count or 1)
            new_count = int(new_count or 1)
            index += 1
            old = []
            new = []
            while index < len(lines) and not lines[index].startswith("@@ "):
                line = lines[index]
                if line == "\n":
                    line = " \n"
                if line.startswith("\\ No newline"):
                    raise ValueError(f"Unsupported newline marker: {target}")
                if line[:1] in (" ", "-"):
                    old.append(line[1:])
                if line[:1] in (" ", "+"):
                    new.append(line[1:])
                index += 1
            if (len(old), len(new)) != (old_count, new_count):
                raise ValueError(f"Invalid hunk counts: {target}:{old_start}")
            expected = max(0, int(old_start) - 1) + offset
            if old:
                if content[expected:expected + len(old)] == old:
                    position = expected
                else:
                    matches = [i for i in range(previous_end, len(content) - len(old) + 1)
                               if content[i:i + len(old)] == old]
                    if len(matches) != 1:
                        raise ValueError(f"Hunk does not match uniquely: {target}:{old_start}")
                    position = matches[0]
            else:
                position = expected
            if position < previous_end:
                raise ValueError(f"Overlapping hunks: {target}:{old_start}")
            content[position:position + len(old)] = new
            previous_end = position + len(new)
            offset = position - max(0, int(old_start) - 1) + len(new) - len(old)
        files[target] = "".join(content).encode()


def main():
    root = Path(__file__).resolve().parents[4]
    engine = Path(sys.argv[1])
    series = json.loads((root / "integrations/langflow/patches/series.json").read_text())
    revision = series["upstream"]["commit"]
    tree = subprocess.check_output(["git", "-C", str(engine), "rev-parse", f"{revision}^{{tree}}"], text=True).strip()
    assert tree == series["upstream"]["tree"]
    manifest = json.loads((root / "reports/langflow-feasibility-review/backend-queue-composition.json").read_text())
    reader = manifest["reader"]
    target = "src/backend/base/langflow/services/trellis_v1/external_waits.py"
    prior = git_file(root, reader["priorSourceCommit"], reader["sourcePath"])
    current = git_file(root, reader["sourceCommit"], reader["sourcePath"])
    assert digest(prior) == reader["priorSourceSha256"]
    assert digest(current) == reader["sourceSha256"]
    files = {}
    for entry in series["patches"]:
        patch = (root / entry["path"]).read_bytes()
        assert digest(patch) == entry["sha256"], entry["name"]
        apply_patch(files, patch.decode(), entry["directory"], engine, revision)
        if entry["name"] == "backend":
            assert files[target] == added_source(prior.decode(), target)
        if entry["name"] == "backend-delivery-reader":
            assert files[target] == added_source(current.decode(), target)
    for path, value in files.items():
        if path.endswith(".py"):
            compile(value, path, "exec")
    source_hashes = {path: digest(value) for path, value in sorted(files.items())}
    aggregate = digest(json.dumps(source_hashes, sort_keys=True, separators=(",", ":")).encode())
    print(json.dumps({"patches": len(series["patches"]), "files": len(files),
                      "sourceHashes": source_hashes, "aggregateSha256": aggregate,
                      "runtimeVerified": False}, indent=2))


if __name__ == "__main__":
    main()
