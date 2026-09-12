import { originDir } from "../../originDir.ts";
import { expect, test } from "bun:test";
import { exec, execFileSync, execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const repoRoot = join(originDir(import.meta.dir), "..");

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

// A node:child_process call without `env` gets the environment the process
// started with, which has neither the fake on PATH nor the marker. The
// preload wraps these functions, so such a call gets the preload's values.
test("node:child_process calls without env get the environment of the preload", async () => {
	const marker = process.env.TRELLIS_LAUNCHCTL_MARKER!;
	const script = "echo $TRELLIS_LAUNCHCTL_MARKER";
	expect(spawnSync("sh", ["-c", script], { encoding: "utf8" }).stdout.trim()).toBe(marker);
	expect(execSync(script, { encoding: "utf8" }).trim()).toBe(marker);
	expect(execFileSync("sh", ["-c", script], { encoding: "utf8" }).trim()).toBe(marker);
	expect((await promisify(exec)(script)).stdout.trim()).toBe(marker);
});

// The preload checks the marker after the last test of the run, so one
// stray launchctl call anywhere in a workspace fails that workspace's run.
for (const [kind, name] of [
	["bun", "Bun.spawn"],
	["node", "node:child_process"],
] as const) {
	test(`a test run that spawns launchctl through ${name} fails and names the call`, () => {
		const nested = Bun.spawnSync(["bun", "test", "./test/fixtures/spawnsLaunchctl.ts"], {
			cwd: repoRoot,
			env: { ...process.env, TRELLIS_GUARD_FIXTURE: kind },
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = nested.stdout.toString() + nested.stderr.toString();
		expect(nested.exitCode, output).not.toBe(0);
		expect(output).toContain("a test spawned launchctl: launchctl help");
	});
}
