#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

const pidFile = process.env.TRELLIS_DETACHED_CHILD_PID_FILE;
if (existsSync(pidFile)) {
	process.stdout.write("PATH=/usr/bin\0TRELLIS_LOGIN_RETRY=ready\0");
} else {
	const child = spawn("/bin/sleep", ["10"], {
		detached: true,
		stdio: ["ignore", "inherit", "inherit"],
	});
	writeFileSync(pidFile, String(child.pid));
	child.unref();
	process.stdout.write("PATH=/usr/bin\0");
}
