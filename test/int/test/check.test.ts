import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkTasks } from "../../../scripts/check";
import { originDir } from "../../originDir.ts";

const root = join(originDir(import.meta.dir), "..");

const scriptsOf = async (workspace: string) =>
	((await Bun.file(join(root, workspace, "package.json")).json()) as { scripts: Record<string, string> }).scripts;

// `bun test` with no path runs a file whose name ends in .test, _test, .spec,
// or _spec before the script extension. A timing file ends in .perf instead,
// so the test task of its workspace never runs it.
const testTaskRuns = (file: string) => /[._](test|spec)\.[cm]?[jt]sx?$/.test(file);

// The files that assert on milliseconds or resident memory, by workspace.
// A parallel task on the same machine changes what they measure.
const timingFiles: Record<string, string[]> = {
	"apps/server": [
		"test/perf/list.perf.ts",
		"test/perf/search.perf.ts",
		"test/perf/boot.perf.ts",
		"test/perf/poller.perf.ts",
		"test/perf/memory.perf.ts",
		"test/perf/attachments.perf.ts",
		"test/perf/concurrency.perf.ts",
		"test/perf/backup.perf.ts",
		"src/db/worker.drift.perf.ts",
	],
	"packages/cli": ["test/coldStart.perf.ts"],
};

describe("bun run check", () => {
	test("check covers functional checks and leaves performance tests opt-in", async () => {
		expect(checkTasks.full).toEqual(["lint", "typecheck", "test", "size-budget", "typecheck:repo", "test:repo"]);
		const scripts = await scriptsOf(".");
		expect(scripts["perf:10k"]).toBe("turbo run perf:10k --concurrency=1");
	});

	test("check forwards flags and the task exit code without a performance run", () => {
		const bin = mkdtempSync(join(tmpdir(), "trellis-check-"));
		writeFileSync(join(bin, "turbo"), `#!/bin/sh\nprintf '%s\\n' "$@"\nexit 7\n`, { mode: 0o755 });
		const result = Bun.spawnSync([process.execPath, join(root, "scripts/check.ts"), "--force"], {
			env: { ...process.env, PATH: bin, TRELLIS_CHECK_NESTED: "" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.stdout.toString().trim().split("\n")).toEqual([
			"run",
			"lint",
			"typecheck",
			"test",
			"size-budget",
			"typecheck:repo",
			"test:repo",
			"--force",
		]);
		expect(result.exitCode).toBe(7);
	});

	test("every timing file runs in perf:10k and never in the test task of its workspace", async () => {
		for (const [workspace, files] of Object.entries(timingFiles)) {
			const scripts = await scriptsOf(workspace);
			expect(scripts.test, `${workspace} test`).toStartWith("bun test");
			for (const file of files) {
				expect(existsSync(join(root, workspace, file)), `${workspace}/${file} exists`).toBe(true);
				expect(scripts["perf:10k"], `${workspace} perf:10k runs ${file}`).toContain(`./${file}`);
				expect(testTaskRuns(file), `${workspace} test skips ${file}`).toBe(false);
			}
		}
	});

	// ARCHITECTURE.md, Performance budgets: `bun run perf` runs the same suite
	// against the 50k seed.
	test("bun run perf runs every server timing file at 50k rows", async () => {
		const scripts = await scriptsOf("apps/server");
		expect(scripts.perf).toStartWith("TRELLIS_PERF_ROWS=50000 ");
		for (const file of timingFiles["apps/server"]!) {
			expect(scripts.perf, `apps/server perf runs ${file}`).toContain(`./${file}`);
		}
	});
});
