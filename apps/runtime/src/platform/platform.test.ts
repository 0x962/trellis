import { expect, test } from "bun:test";
import { inspectProcess } from "../inspectProcess.ts";
import { processIdentity } from "../processIdentity";

test("the process inspector of the current host observes the test process", () => {
	const observed = inspectProcess(process.pid);
	expect(observed.kind).toBe("live");
	if (observed.kind !== "live") return;
	expect(observed.process.pid).toBe(process.pid);
	expect(observed.process.parentPid).toBe(process.ppid);
	const identity = processIdentity(process.pid);
	expect(identity.kind === "live" && identity.process.identity).toBe(observed.process.identity);
	expect(observed.process.identity).toMatch(
		process.platform === "linux" ? /^linux:[0-9a-f-]+:\d+:\d+$/ : /^\d+:\d+:\d+$/,
	);
});
