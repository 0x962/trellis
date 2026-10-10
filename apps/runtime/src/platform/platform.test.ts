import { expect, test } from "bun:test";

// On Linux, Bun test crashes when it finalizes a koffi object, so the Linux
// process cases check the same identity under Node.
test.skipIf(process.platform !== "darwin")(
	"the process inspector of the current host observes the test process",
	async () => {
		const { inspectProcess } = await import("../inspectProcess.ts");
		const { processIdentity } = await import("../processIdentity");
		const observed = inspectProcess(process.pid);
		expect(observed.kind).toBe("live");
		if (observed.kind !== "live") return;
		expect(observed.process.pid).toBe(process.pid);
		expect(observed.process.parentPid).toBe(process.ppid);
		const identity = processIdentity(process.pid);
		expect(identity.kind === "live" && identity.process.identity).toBe(observed.process.identity);
		expect(observed.process.identity).toMatch(/^\d+:\d+:\d+$/);
	},
);
