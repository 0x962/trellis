import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tempDirs } from "../../../tempDir.ts";
import { git } from "./git.ts";
import { runGit } from "./gitProcess.ts";
import { gitRecordPage } from "./gitRecordPage.ts";
import { gitTextPage } from "./gitTextPage.ts";

const tempDir = tempDirs();
const alias = (script: string) => ["-c", `alias.probe=!${script}`, "probe"];

const processIds = async (directory: string) => {
	const path = join(directory, "pids");
	while (!(await Bun.file(path).exists())) await Bun.sleep(10);
	return (await readFile(path, "utf8")).trim().split(" ").map(Number);
};

const expectExited = (pids: number[]) => {
	for (const pid of pids) {
		expect(() => process.kill(pid, 0)).toThrow();
	}
};

describe("workspace Git cancellation", () => {
	test("returns complete output after the former 30-second deadline", async () => {
		const directory = await tempDir("trellis-git-deadline-");
		const controller = new AbortController();
		const started = performance.now();
		try {
			const output = await git(directory, alias("sleep 31; printf complete"), controller.signal);
			expect(output).toBe("complete");
			expect(performance.now() - started).toBeGreaterThan(30_000);
		} finally {
			controller.abort();
		}
	}, 60_000);

	for (const [name, run] of [
		["text", (directory: string, args: string[], signal: AbortSignal) => git(directory, args, signal)],
		[
			"text page",
			(directory: string, args: string[], signal: AbortSignal) =>
				gitTextPage(directory, args, { offset: 0, limit: 10 }, signal),
		],
		[
			"record page",
			(directory: string, args: string[], signal: AbortSignal) =>
				gitRecordPage(directory, args, { offset: 0, limit: 10 }, signal),
		],
	] as const) {
		test(`cancels ${name} and stops Git and its child`, async () => {
			const directory = await tempDir("trellis-git-cancel-");
			const controller = new AbortController();
			const reason = new Error("Caller canceled the workspace read");
			const result = run(directory, alias('echo "$$ $PPID" > pids; exec sleep 60'), controller.signal);
			const settled = result.then(
				(value) => ({ value, error: null }),
				(error: unknown) => ({ value: null, error }),
			);
			try {
				const pids = await processIds(directory);
				expect(pids).toHaveLength(2);
				controller.abort(reason);
				expect((await settled).error).toBe(reason);
				expectExited(pids);
			} finally {
				controller.abort(reason);
				await settled;
			}
		});
	}

	test("does not start Git for a canceled caller", async () => {
		const directory = await tempDir("trellis-git-preabort-");
		const reason = new Error("Already canceled");
		await expect(git(directory, alias("touch started"), AbortSignal.abort(reason))).rejects.toBe(reason);
		expect(await Bun.file(join(directory, "started")).exists()).toBe(false);
	});

	test("stops Git and its child when the output reader fails", async () => {
		const directory = await tempDir("trellis-git-reader-");
		const reason = new Error("Invalid output");
		let pids: number[] = [];
		await expect(
			runGit(directory, alias('echo "$$ $PPID" > pids; exec sleep 60'), undefined, async () => {
				pids = await processIds(directory);
				throw reason;
			}),
		).rejects.toBe(reason);
		expect(pids).toHaveLength(2);
		expectExited(pids);
	});

	test("preserves stderr from a failed Git command", async () => {
		const directory = await tempDir("trellis-git-error-");
		await expect(git(directory, alias("printf 'probe failed' >&2; exit 7"))).rejects.toThrow("probe failed");
	});
});
