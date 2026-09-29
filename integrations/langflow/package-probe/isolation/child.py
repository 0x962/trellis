import json
import os
import socket
import sys
from pathlib import Path


allowed_root = Path(sys.argv[1])
forbidden_file = Path(sys.argv[2])
host = sys.argv[3]
port = int(sys.argv[4])

allowed_file = allowed_root / "write.txt"
allowed_file.write_text("allowed", encoding="utf-8")

try:
	forbidden_file.read_text(encoding="utf-8")
	forbidden_read = True
except OSError:
	forbidden_read = False

try:
	with socket.create_connection((host, port), timeout=1):
		network_connect = True
except OSError:
	network_connect = False

print(
	json.dumps(
		{
			"allowedReadWrite": allowed_file.read_text(encoding="utf-8") == "allowed",
			"forbiddenRead": forbidden_read,
			"networkConnect": network_connect,
			"secretEnvironmentPresent": "TRELLIS_PROBE_SECRET" in os.environ,
		},
		sort_keys=True,
	)
)
