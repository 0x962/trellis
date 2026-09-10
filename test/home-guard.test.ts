import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { changedPaths, guardedPaths, snapshot } from "./homeGuard.ts";

const repoRoot = join(import.meta.dir, "..");
const root = process.env.TRELLIS_TEST_ROOT!;
const inside = (path: string) => path.startsWith(`${root}/`);

// A test process that resolves a path through the user home must reach a
// temp directory, never the LaunchAgents directory, the shim, or the margin
// gateway of the person who runs the tests.
describe("the test home", () => {
	test("HOME, os.homedir(), Bun.env.HOME, the XDG dirs, and TRELLIS_HOME point inside the run root", () => {
		expect(inside(homedir())).toBe(true);
		expect(Bun.env.HOME).toBe(homedir());
		expect(homedir()).not.toBe(userInfo().homedir);
		for (const key of ["XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "TRELLIS_HOME"]) {
			expect(inside(process.env[key]!), key).toBe(true);
		}
	});

	test("a nested process gets the same home through Bun.spawnSync and node:child_process", () => {
		const script = 'console.log(JSON.stringify([require("node:os").homedir(), Bun.env.HOME]))';
		const outputs = [
			Bun.spawnSync(["bun", "-e", script]).stdout.toString(),
			spawnSync("bun", ["-e", script], { encoding: "utf8" }).stdout,
			execFileSync("bun", ["-e", script], { encoding: "utf8" }),
		];
		for (const output of outputs) expect(JSON.parse(output)).toEqual([homedir(), homedir()]);
	});
});

describe("the real home guard", () => {
	test("guardedPaths names the LaunchAgents directory, the shim directory, and the margin gateway", () => {
		expect(guardedPaths("/Users/someone")).toEqual([
			"/Users/someone/Library/LaunchAgents",
			"/Users/someone/Library/LaunchAgents/com.trellis.server.plist",
			"/Users/someone/.local/bin",
			"/Users/someone/.local/bin/trellis",
			"/Users/someone/projects/margin/src/gateway.ts",
		]);
	});

	test("changedPaths reports a path that appears, changes, or goes away", async () => {
		const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "guard-"));
		const [kept, edited, created, removed] = ["kept", "edited", "created", "removed"].map((name) => join(dir, name));
		for (const path of [kept!, edited!, removed!]) writeFileSync(path, "a");
		const paths = [kept!, edited!, created!, removed!];
		const before = snapshot(paths);
		await Bun.sleep(20);
		writeFileSync(edited!, "b");
		writeFileSync(created!, "c");
		rmSync(removed!);
		expect(changedPaths(before, snapshot(paths))).toEqual([edited!, created!, removed!]);
	});

	// TRELLIS_TEST_GUARD_HOME moves the guard of the nested run to a temp
	// directory, so this test proves the guard without a write to the real home.
	test("a test run that writes under the guarded home fails and names the path", () => {
		const guardHome = mkdtempSync(join(process.env.TRELLIS_HOME!, "guard-home-"));
		mkdirSync(join(guardHome, "Library"));
		const run = Bun.spawnSync(["bun", "test", "./test/fixtures/runRoot.ts"], {
			cwd: repoRoot,
			env: { ...process.env, TRELLIS_ROOT_FIXTURE: "write", TRELLIS_TEST_GUARD_HOME: guardHome },
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = run.stdout.toString() + run.stderr.toString();
		expect(run.exitCode, output).not.toBe(0);
		expect(output).toContain("a test wrote under the real home");
		expect(output).toContain(join(guardHome, "Library", "LaunchAgents", "com.trellis.server.plist"));
	}, 30_000);
});
