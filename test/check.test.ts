import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkTasks } from "../scripts/check";

const root = join(import.meta.dir, "..");

const scriptsOf = async (workspace: string) =>
	((await Bun.file(join(root, workspace, "package.json")).json()) as { scripts: Record<string, string> }).scripts;

const ignorePatterns = (script: string) => [...script.matchAll(/--path-ignore-patterns '([^']+)'/g)].map((m) => m[1]!);

// The files that assert on milliseconds or resident memory, by workspace.
// A parallel task on the same machine changes what they measure.
const timingFiles: Record<string, string[]> = {
	"apps/server": [
		"test/perf/list.perf.ts",
		"test/perf/search.perf.ts",
		"test/perf/boot.test.ts",
		"test/perf/poller.test.ts",
		"test/perf/memory.test.ts",
		"src/db/worker.drift.test.ts",
	],
	"packages/cli": ["test/perf.test.ts"],
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
			const ignored = ignorePatterns(scripts.test!);
			for (const file of files) {
				expect(scripts["perf:10k"], `${workspace} perf:10k runs ${file}`).toContain(`./${file}`);
				expect(
					ignored.some((pattern) => new Bun.Glob(pattern).match(file)),
					`${workspace} test skips ${file}`,
				).toBe(true);
			}
		}
	});
});
