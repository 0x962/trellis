import argparse
import hashlib
import importlib.util
import json
import stat
import subprocess
import sys
from pathlib import Path, PurePosixPath


def digest(data: bytes) -> str:
	return hashlib.sha256(data).hexdigest()


def patch_paths(source: Path, patch: Path, patch_directory: str | None = None) -> list[str]:
	command = ["git", "-C", str(source), "apply", "--numstat", "-z"]
	if patch_directory is not None:
		command.append(f"--directory={patch_directory}")
	command.append(str(patch))
	output = subprocess.run(
		command,
		check=True,
		capture_output=True,
	).stdout
	paths = []
	for record in output.split(b"\0"):
		if not record:
			continue
		_, _, encoded_path = record.split(b"\t", 2)
		path = encoded_path.decode()
		parsed = PurePosixPath(path)
		assert path
		assert not parsed.is_absolute()
		assert ".." not in parsed.parts
		paths.append(path)
	assert len(paths) == len(set(paths))
	return sorted(paths)


def source_status(source: Path) -> tuple[bytes, list[tuple[str, str]]]:
	output = subprocess.run(
		[
			"git",
			"-C",
			str(source),
			"status",
			"--porcelain=v1",
			"-z",
			"--untracked-files=all",
		],
		check=True,
		capture_output=True,
	).stdout
	entries = []
	for record in output.split(b"\0"):
		if not record:
			continue
		status_code = record[:2].decode()
		assert "R" not in status_code
		assert "C" not in status_code
		entries.append((status_code, record[3:].decode()))
	return output, sorted(entries, key=lambda entry: entry[1])


def verify_overlay(
	source: Path, patch: Path, patch_directory: str | None = None
) -> tuple[str, list[dict[str, object]]]:
	reverse_command = ["git", "-C", str(source), "apply", "--reverse", "--check"]
	if patch_directory is not None:
		reverse_command.append(f"--directory={patch_directory}")
	reverse_command.append(str(patch))
	subprocess.run(reverse_command, check=True)
	status_bytes, status_entries = source_status(source)
	assert [path for _, path in status_entries] == patch_paths(source, patch, patch_directory)

	manifest = []
	for status_code, relative_path in status_entries:
		file_path = source / relative_path
		exists = file_path.exists() or file_path.is_symlink()
		file_stat = file_path.lstat() if exists else None
		if file_stat is not None:
			assert stat.S_ISREG(file_stat.st_mode)
		manifest.append(
			{
				"exists": exists,
				"mode": format(stat.S_IMODE(file_stat.st_mode), "04o") if file_stat is not None else None,
				"path": relative_path,
				"sha256": digest(file_path.read_bytes()) if exists else None,
				"status": status_code,
			}
		)
	return digest(status_bytes), manifest


def main() -> None:
	parser = argparse.ArgumentParser()
	parser.add_argument("--source", required=True)
	parser.add_argument("--patch", required=True)
	parser.add_argument("--expected-commit", required=True)
	parser.add_argument("--expected-diff-sha256", required=True)
	parser.add_argument("--expected-lock-sha256", required=True)
	parser.add_argument("--expected-patch-sha256", required=True)
	parser.add_argument("--package", action="append", required=True)
	parser.add_argument("--patch-directory")
	arguments = parser.parse_args()

	source = Path(arguments.source).resolve()
	patch = Path(arguments.patch).resolve()
	commit = subprocess.run(
		["git", "-C", str(source), "rev-parse", "HEAD"], check=True, capture_output=True, text=True
	).stdout.strip()
	tracked_diff = subprocess.run(
		["git", "-C", str(source), "diff", "--binary", "--no-ext-diff", "HEAD"],
		check=True,
		capture_output=True,
	).stdout
	lock_sha256 = digest((source / "uv.lock").read_bytes())
	patch_sha256 = digest(patch.read_bytes())
	status_sha256, overlay_manifest = verify_overlay(source, patch, arguments.patch_directory)
	overlay_bytes = json.dumps(overlay_manifest, separators=(",", ":"), sort_keys=True).encode()

	assert commit == arguments.expected_commit
	assert digest(tracked_diff) == arguments.expected_diff_sha256
	assert lock_sha256 == arguments.expected_lock_sha256
	assert patch_sha256 == arguments.expected_patch_sha256

	packages = []
	for package in arguments.package:
		spec = importlib.util.find_spec(package)
		assert spec is not None
		assert spec.origin is not None
		origin = Path(spec.origin).resolve()
		assert origin.is_relative_to(source)
		packages.append(
			{"name": package, "origin": str(origin), "sourceSha256": digest(origin.read_bytes())}
		)

	print(
		json.dumps(
			{
				"commit": commit,
				"lockSha256": lock_sha256,
				"overlayManifest": overlay_manifest,
				"overlayManifestSha256": digest(overlay_bytes),
				"packages": packages,
				"patchSha256": patch_sha256,
				"pythonExecutable": sys.executable,
				"pythonVersion": sys.version,
				"statusSha256": status_sha256,
				"trackedDiffSha256": digest(tracked_diff),
			},
			indent=2,
			sort_keys=True,
		)
	)


if __name__ == "__main__":
	main()
