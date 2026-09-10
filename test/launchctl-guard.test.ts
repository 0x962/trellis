import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

// test/preload.ts puts a fake launchctl first on PATH in every test process.
// A real launchctl call from a test loads a server agent on the person's own
// data home, so the fake records the call, loads nothing, and exits 1.
test("launchctl in a test process is the fake in TRELLIS_HOME, which records the call and exits 1", async () => {
	const home = process.env.TRELLIS_HOME!;
	// Bun.which reads the PATH the process started with unless it gets one.
	expect(Bun.which("launchctl", { PATH: process.env.PATH! })).toBe(join(home, "bin", "launchctl"));
	const marker = join(home, "guard-probe");
	const proc = Bun.spawn(["launchctl", "help"], {
		env: { ...process.env, TRELLIS_LAUNCHCTL_MARKER: marker },
		stdout: "ignore",
		stderr: "ignore",
	});
	expect(await proc.exited).toBe(1);
	expect(readFileSync(marker, "utf8")).toBe("launchctl help\n");
});

// The preload checks the marker after the last test of the run, so one
// stray launchctl call anywhere in a workspace fails that workspace's run.
test("a test run that spawns launchctl fails and names the call", () => {
	const nested = Bun.spawnSync(["bun", "test", "./test/fixtures/spawnsLaunchctl.ts"], {
		cwd: repoRoot,
		env: { ...process.env, TRELLIS_GUARD_FIXTURE: "1" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = nested.stdout.toString() + nested.stderr.toString();
	expect(nested.exitCode, output).not.toBe(0);
	expect(output).toContain("a test spawned launchctl: launchctl help");
});
