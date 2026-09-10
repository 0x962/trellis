import { expect, test } from "bun:test";

// test/launchctl-guard.test.ts runs this file in a nested `bun test` with
// TRELLIS_GUARD_FIXTURE=1. The test passes, and the preload must still fail
// the run because a test spawned launchctl.
test.if(process.env.TRELLIS_GUARD_FIXTURE === "1")("a test that spawns launchctl", async () => {
	const proc = Bun.spawn(["launchctl", "help"], { stdout: "ignore", stderr: "ignore" });
	expect(await proc.exited).toBe(1);
});
