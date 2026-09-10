import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { linkPr, seedPr, seedProject, seedTicket } from "../../test/fixtures";
import { testCtx } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { caught } from "../../test/helpers/errors.ts";
import { ghStub, type StubReply } from "../../test/helpers/gh-stub.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { createGhRunner, type GhRunner, type GhSlot } from "../gh/run.ts";
import { diff } from "./pullRequests.ts";

// diff runs `gh pr diff` on the interactive slot, cuts the text at 1 MB, and
// keeps the answer for 60 seconds. A person who reopens a diff inside that
// minute spawns no process.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});
const stub = (replies: Record<string, StubReply>) => {
	const handle = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-diff-")), replies);
	restores.push(handle.restore);
	return handle;
};

// Wraps a runner and records the slot and the arguments of every call.
const recording = (runner: GhRunner) => {
	const calls: Array<{ slot: GhSlot; args: string[] }> = [];
	const wrapped = Object.assign(
		(slot: GhSlot, args: string[]) => {
			calls.push({ slot, args });
			return runner(slot, args);
		},
		{ bin: runner.bin, timeoutMs: runner.timeoutMs },
	) as GhRunner;
	return { wrapped, calls };
};

const seedOnePr = async (number: number) => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number });
	const pr = await seedPr(h.db, { number });
	await linkPr(h.db, ticket, pr);
	return { pr, url: `https://github.com/acme/web/pull/${number}` };
};

const patch = "diff --git a/one.ts b/one.ts\n+const one = 1;\n";

describe("pullRequests.diff", () => {
	test("diff returns the gh output for one pull request", async () => {
		const { pr, url } = await seedOnePr(21);
		stub({ "pr diff": { stdout: patch, stderr: "", exitCode: 0 } });
		const { wrapped, calls } = recording(createGhRunner());
		const ctx = testCtx({ db: h.db, home, gh: wrapped }).ctx;

		const result = await h.db.transaction((tx) => diff(ctx, tx, { id: pr }));

		expect(result).toEqual({ diff: patch, truncated: false, url });
		expect(calls).toEqual([{ slot: "interactive", args: ["pr", "diff", url] }]);
	});

	test("a diff over 1 MB comes back cut and marked truncated", async () => {
		const { pr, url } = await seedOnePr(22);
		stub({ "pr diff": { stdout: "x".repeat(1024 * 1024 + 100), stderr: "", exitCode: 0 } });
		const ctx = testCtx({ db: h.db, home, gh: createGhRunner() }).ctx;

		const result = await h.db.transaction((tx) => diff(ctx, tx, { id: pr }));

		expect(new TextEncoder().encode(result.diff).byteLength).toBe(1024 * 1024);
		expect(result.truncated).toBe(true);
		expect(result.url).toBe(url);
	});

	test("a diff is cached for 60 seconds", async () => {
		const { pr } = await seedOnePr(23);
		const handle = stub({ "pr diff": { stdout: patch, stderr: "", exitCode: 0 } });
		let clock = Date.parse("2026-09-09T10:00:00Z");
		const ctx = testCtx({ db: h.db, home, gh: createGhRunner(), now: () => new Date(clock) }).ctx;
		const run = () => h.db.transaction((tx) => diff(ctx, tx, { id: pr }));

		const first = await run();
		clock += 59_000;
		const second = await run();
		expect(second).toEqual(first);
		expect(handle.spawns()).toHaveLength(1);

		clock += 2_000;
		await run();
		expect(handle.spawns()).toHaveLength(2);
	});

	test("diff with gh missing is GH_UNAVAILABLE", async () => {
		const { pr } = await seedOnePr(24);
		const scratch = mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-missing-"));
		const handle = ghStub(scratch, { "pr diff": { stdout: patch, stderr: "", exitCode: 0 } });
		restores.push(handle.restore);
		process.env.TRELLIS_GH_BIN = join(scratch, "no-gh-here");
		const missingCtx = testCtx({ db: h.db, home, gh: createGhRunner() }).ctx;

		const error = await caught(h.db.transaction((tx) => diff(missingCtx, tx, { id: pr })));
		expect(error.code).toBe("GH_UNAVAILABLE");
		expect(error.data).toEqual({ reason: "missing" });

		process.env.TRELLIS_GH_BIN = join(import.meta.dir, "..", "..", "test", "stubs", "gh.ts");
		const workingCtx = testCtx({ db: h.db, home, gh: createGhRunner() }).ctx;
		const result = await h.db.transaction((tx) => diff(workingCtx, tx, { id: pr }));
		expect(result.diff).toBe(patch);
	});
});
