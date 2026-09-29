import json
import socket
import sys
from pathlib import Path


private_root = Path(sys.argv[1])
credential_file = Path(sys.argv[2])
host = sys.argv[3]
port = int(sys.argv[4])

private_file = private_root / "sandbox-write.txt"
private_file.write_text("private", encoding="utf-8")

try:
	credential_file.read_text(encoding="utf-8")
	credential_read = True
except OSError:
	credential_read = False

try:
	with socket.create_connection((host, port), timeout=1):
		loopback_connect = True
except OSError:
	loopback_connect = False

try:
	with socket.create_connection(("1.1.1.1", 443), timeout=1):
		external_connect = True
except OSError:
	external_connect = False

print(
	json.dumps(
		{
			"credentialRead": credential_read,
			"externalConnect": external_connect,
			"loopbackConnect": loopback_connect,
			"privateWrite": private_file.read_text(encoding="utf-8") == "private",
		},
		sort_keys=True,
	)
)
