import argparse
import json
import os
import shutil
import socket
import stat
import subprocess
import tempfile
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--python", required=True)
arguments = parser.parse_args()

probe_dir = Path(__file__).resolve().parent
child = probe_dir / "child.py"
profile = probe_dir / "macos.sb"
python = Path(arguments.python).resolve()

with tempfile.TemporaryDirectory(prefix="trellis-langflow-isolation-") as temp:
	root = Path(temp).resolve()
	allowed_root = root / "allowed"
	allowed_root.mkdir(mode=0o700)
	forbidden_file = root / "forbidden-secret"
	forbidden_file.write_text("secret", encoding="utf-8")
	forbidden_file.chmod(stat.S_IRUSR | stat.S_IWUSR)

	with socket.socket() as listener:
		listener.bind(("127.0.0.1", 0))
		listener.listen(2)
		host, port = listener.getsockname()
		environment = {
			"PATH": os.environ["PATH"],
			"PYTHONDONTWRITEBYTECODE": "1",
		}
		command = [str(python), str(child), str(allowed_root), str(forbidden_file), host, str(port)]
		unconfined = subprocess.run(command, check=True, capture_output=True, text=True, env=environment)
		sandboxed = subprocess.run(
			[
				"/usr/bin/sandbox-exec",
				"-D",
				f"ALLOWED_ROOT={allowed_root}",
				"-D",
				f"FORBIDDEN_FILE={forbidden_file}",
				"-f",
				str(profile),
				*command,
			],
			capture_output=True,
			text=True,
			env=environment,
		)
		if sandboxed.returncode != 0:
			raise RuntimeError(
				json.dumps(
					{
						"returncode": sandboxed.returncode,
						"stderr": sandboxed.stderr,
						"stdout": sandboxed.stdout,
					},
					sort_keys=True,
				)
			)

	result = {
		"python": {
			"executable": str(python),
			"version": subprocess.run(
				[str(python), "--version"], check=True, capture_output=True, text=True
			).stdout.strip(),
		},
		"unconfinedWithSecretEnvironmentRemoved": json.loads(unconfined.stdout),
		"macosSandboxWithSecretEnvironmentRemoved": json.loads(sandboxed.stdout),
		"profileSha256": subprocess.run(
			["/usr/bin/shasum", "-a", "256", str(profile)], check=True, capture_output=True, text=True
		).stdout.split()[0],
		"sandboxExecutable": shutil.which("sandbox-exec"),
	}
	print(json.dumps(result, indent=2, sort_keys=True))
