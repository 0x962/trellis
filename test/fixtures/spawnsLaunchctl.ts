import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

// test/launchctl-guard.test.ts runs this file in a nested `bun test` with
// TRELLIS_GUARD_FIXTURE set to `bun` or `node`. The test passes, and the
// preload must still fail the run because a test spawned launchctl.
test.if(process.env.TRELLIS_GUARD_FIXTURE === "bun")("a test that spawns launchctl with Bun.spawn", async () => {
	const proc = Bun.spawn(["launchctl", "help"], { stdout: "ignore", stderr: "ignore" });
	expect(await proc.exited).toBe(1);
});

test.if(process.env.TRELLIS_GUARD_FIXTURE === "node")("a test that spawns launchctl with node:child_process", () => {
	expect(spawnSync("launchctl", ["help"]).status).toBe(1);
});
