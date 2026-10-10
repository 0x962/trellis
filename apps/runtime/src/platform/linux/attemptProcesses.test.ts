import { expect, test } from "bun:test";
import { createLinuxAttemptProcesses } from "./attemptProcesses.ts";

const environments: Record<string, string> = {
	"41": "TRELLIS_ATTEMPT_ID=attempt-one\0TRELLIS_RUNTIME_HOME=/runtime\0",
	"42": "PATH=/bin\0TRELLIS_ATTEMPT_ID=attempt-one\0TRELLIS_RUNTIME_HOME=/runtime\0",
	"43": "TRELLIS_ATTEMPT_ID=attempt-two\0TRELLIS_RUNTIME_HOME=/runtime\0",
	"45": "TRELLIS_ATTEMPT_ID=attempt-one\0TRELLIS_RUNTIME_HOME=/runtime\0",
};

test("attempt processes are the processes of this user that carry both attempt markers", () => {
	const list = createLinuxAttemptProcesses({
		readDirectory: () => ["self", "40", "41", "42", "43", "44", "45"],
		readFile(path) {
			const pid = path.split("/")[2]!;
			if (pid === "44") throw Object.assign(new Error("denied"), { code: "EACCES" });
			const value = environments[pid];
			if (value === undefined) throw Object.assign(new Error("gone"), { code: "ENOENT" });
			return value;
		},
		ownerOf: (path) => (path === "/proc/45" ? 0 : 1001),
		uid: 1001,
		runtimePid: 41,
		processIdentity: (pid) => ({
			kind: "live",
			process: {
				pid,
				parentPid: 1,
				groupId: pid,
				identity: `linux:boot:${pid}:1`,
				startedAt: "2026-10-10T00:00:00.000Z",
			},
		}),
	});
	expect(list("/runtime", "attempt-one").map((match) => match.pid)).toEqual([42]);
});
