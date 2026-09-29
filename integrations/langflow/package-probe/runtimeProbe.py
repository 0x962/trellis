import argparse
import json
import os
import signal
import socket
import stat
import subprocess
import time
import urllib.request
from contextlib import suppress
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--candidate", required=True)
parser.add_argument("--repository", required=True)
arguments = parser.parse_args()

candidate = Path(arguments.candidate).resolve()
repository = Path(arguments.repository).resolve()
source = candidate / "source"
python = candidate / "venv" / "bin" / "python"
langflow = candidate / "venv" / "bin" / "langflow"
frontend = source / "src" / "frontend" / "build"
run_root = candidate / "runs" / "TRL-667" / "runtime"
data_home = run_root / "data-home"
home = run_root / "home"
temp = run_root / "tmp"
profile = repository / "integrations" / "langflow" / "package-probe" / "isolation" / "macos-loopback.sb"
loopback_child = repository / "integrations" / "langflow" / "package-probe" / "isolation" / "loopbackChild.py"
credential = candidate / "evidence" / "forbidden-credential"

for directory in (run_root, data_home, home, temp):
	directory.mkdir(mode=0o700, parents=True, exist_ok=True)
runtime_child = run_root / "loopbackChild.py"
runtime_child.write_bytes(loopback_child.read_bytes())
credential.write_text("fixture-not-a-credential", encoding="utf-8")
credential.chmod(stat.S_IRUSR | stat.S_IWUSR)


def free_port() -> int:
	with socket.socket() as listener:
		listener.bind(("127.0.0.1", 0))
		return int(listener.getsockname()[1])


def sandbox_prefix() -> list[str]:
	user_home = Path.home()
	return [
		"/usr/bin/sandbox-exec",
		"-D",
		f"RUN_ROOT={run_root}",
		"-D",
		f"DENIED_SSH={user_home / '.ssh'}",
		"-D",
		f"DENIED_GH={user_home / '.config' / 'gh'}",
		"-D",
		f"DENIED_AWS={user_home / '.aws'}",
		"-D",
		f"DENIED_TRELLIS={user_home / '.trellis'}",
		"-D",
		f"DENIED_CREDENTIAL={credential}",
		"-f",
		str(profile),
	]


def descendants(root_pid: int) -> list[int]:
	rows = subprocess.run(
		["/bin/ps", "-axo", "pid=,ppid="], check=True, capture_output=True, text=True
	).stdout.splitlines()
	parents: dict[int, list[int]] = {}
	for row in rows:
		pid_text, parent_text = row.split()
		parents.setdefault(int(parent_text), []).append(int(pid_text))
	result = [root_pid]
	for pid in result:
		result.extend(parents.get(pid, []))
	return result


def rss_bytes(pids: list[int]) -> int:
	output = subprocess.run(
		["/bin/ps", "-o", "rss=", "-p", ",".join(str(pid) for pid in pids)],
		check=True,
		capture_output=True,
		text=True,
	).stdout
	return sum(int(value) for value in output.split()) * 1024


def listener_lines(pids: list[int]) -> list[str]:
	result = subprocess.run(
		["/usr/sbin/lsof", "-nP", "-a", "-p", ",".join(str(pid) for pid in pids), "-iTCP", "-sTCP:LISTEN"],
		capture_output=True,
		text=True,
	)
	return result.stdout.splitlines()[1:]


def stop_process_group(process: subprocess.Popen[str]) -> None:
	with suppress(ProcessLookupError):
		os.killpg(process.pid, signal.SIGTERM)
	try:
		process.wait(timeout=30)
	except subprocess.TimeoutExpired:
		with suppress(ProcessLookupError):
			os.killpg(process.pid, signal.SIGKILL)
		process.wait(timeout=30)


def start_once(label: str) -> dict[str, object]:
	port = free_port()
	log_path = run_root / f"{label}.log"
	environment = {
		"DO_NOT_TRACK": "true",
		"HOME": str(home),
		"LANGFLOW_AUTO_LOGIN": "true",
		"LANGFLOW_CONFIG_DIR": str(data_home),
		"LANGFLOW_DATABASE_URL": f"sqlite:///{data_home / 'langflow.db'}",
		"LANGFLOW_DO_NOT_TRACK": "true",
		"PATH": "/usr/bin:/bin",
		"PYTHONDONTWRITEBYTECODE": "1",
		"PYTHONPATH": f"{source / 'src' / 'backend' / 'base'}:{source / 'src' / 'lfx' / 'src'}",
		"TMPDIR": str(temp),
	}
	command = [
		*sandbox_prefix(),
		str(langflow),
		"run",
		"--host",
		"127.0.0.1",
		"--port",
		str(port),
		"--workers",
		"1",
		"--no-open-browser",
		"--frontend-path",
		str(frontend),
	]
	started_at = time.monotonic()
	with log_path.open("w", encoding="utf-8") as log:
		process = subprocess.Popen(
			command,
			cwd=source,
			env=environment,
			stdout=log,
			stderr=subprocess.STDOUT,
			start_new_session=True,
		)
		probe_error: BaseException | None = None
		try:
			deadline = started_at + 180
			status = None
			while time.monotonic() < deadline:
				if process.poll() is not None:
					raise RuntimeError(log_path.read_text(encoding="utf-8"))
				try:
					with urllib.request.urlopen(f"http://127.0.0.1:{port}/health_check", timeout=1) as response:
						status = response.status
						break
				except OSError:
					time.sleep(0.1)
			if status != 200:
				raise RuntimeError(f"health check did not return 200: {log_path}")
			elapsed_ms = round((time.monotonic() - started_at) * 1000)
			pids = descendants(process.pid)
			result = {
				"healthStatus": status,
				"listenerLines": listener_lines(pids),
				"log": str(log_path),
				"pids": pids,
				"port": port,
				"rssBytes": rss_bytes(pids),
				"startupMs": elapsed_ms,
			}
		except BaseException as error:
			probe_error = error
			raise
		finally:
			try:
				stop_process_group(process)
			except BaseException:
				if probe_error is None:
					raise
		result["exitCode"] = process.returncode
		return result


with socket.socket() as listener:
	listener.bind(("127.0.0.1", 0))
	listener.listen(1)
	host, port = listener.getsockname()
	denial = subprocess.run(
		[
			*sandbox_prefix(),
			str(python),
			str(runtime_child),
			str(run_root),
			str(credential),
			host,
			str(port),
		],
		check=True,
		capture_output=True,
		text=True,
		env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"},
	)

result = {
	"cold": start_once("cold"),
	"denials": json.loads(denial.stdout),
	"profileSha256": subprocess.run(
		["/usr/bin/shasum", "-a", "256", str(profile)], check=True, capture_output=True, text=True
	).stdout.split()[0],
	"warm": start_once("warm"),
}
print(json.dumps(result, indent=2, sort_keys=True))
