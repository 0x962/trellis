import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkTasks } from "../scripts/check";

const root = join(import.meta.dir, "..");

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
		"src/db/worker.drift.perf.ts",
	],
	"packages/cli": ["test/coldStart.perf.ts"],
};

describe("bun run check", () => {
	test("perf:10k runs alone after the parallel tasks", () => {
		expect(checkTasks.full).toContain("perf:10k");
		expect(checkTasks.serial).toEqual(["perf:10k"]);
		expect(checkTasks.parallel).toEqual(checkTasks.full.filter((task) => task !== "perf:10k"));
	});

	test("every timing file runs in perf:10k and never in the test task of its workspace", async () => {
		for (const [workspace, files] of Object.entries(timingFiles)) {
			const scripts = await scriptsOf(workspace);
			expect(scripts.test, `${workspace} test`).toBe("bun test");
			for (const file of files) {
				expect(existsSync(join(root, workspace, file)), `${workspace}/${file} exists`).toBe(true);
				expect(scripts["perf:10k"], `${workspace} perf:10k runs ${file}`).toContain(`./${file}`);
				expect(testTaskRuns(file), `${workspace} test skips ${file}`).toBe(false);
			}
		}
	});
});
