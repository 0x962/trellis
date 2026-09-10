import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { testCtx } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { ghStub, type StubReply } from "../../test/helpers/gh-stub.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { createGhRunner } from "../gh/run.ts";
import { gh } from "./system.ts";

// The gh status runs `gh auth status` and reports what the web banner and
// the CLI line print. A missing binary and a signed out gh are answers, not
// failures, so the server never crashes when gh is away.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());

const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});
const stub = (replies: Record<string, StubReply>) => {
	const handle = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-status-")), replies);
	restores.push(handle.restore);
	return handle;
};

const run = () => {
	const ctx = testCtx({ db: h.db, home: freshHomeWithDirs(), gh: createGhRunner() }).ctx;
	return h.db.transaction((tx) => gh(ctx, tx, {}));
};

const signedIn = "github.com\n  ✓ Logged in to github.com account navid (keyring)\n  - Token scopes: 'repo'\n";

describe("system.gh", () => {
	test("the gh status reports the signed in user", async () => {
		stub({ "auth status": { stdout: signedIn, stderr: "", exitCode: 0 } });

		const result = await run();

		expect(result.ok).toBe(true);
		expect(result.user).toBe("navid");
		expect(result.reason).toBeNull();
		expect(Date.parse(result.checkedAt!)).toBeGreaterThan(0);
	});

	test("an unauthenticated gh reports reason unauthenticated", async () => {
		const message = "To get started with GitHub CLI, please run: gh auth login";
		stub({ "auth status": { stdout: "", stderr: message, exitCode: 1 } });

		const result = await run();

		expect(result.ok).toBe(false);
		expect(result.reason).toBe("unauthenticated");
		expect(result.message).toContain("gh auth login");
		expect(result.user).toBeNull();
	});

	test("a missing gh binary reports reason missing", async () => {
		const scratch = mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-none-"));
		const handle = ghStub(scratch, {});
		restores.push(handle.restore);
		process.env.TRELLIS_GH_BIN = join(scratch, "no-gh-here");

		const result = await run();

		expect(result.ok).toBe(false);
		expect(result.reason).toBe("missing");
		expect(result.user).toBeNull();
	});
});
