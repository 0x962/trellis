import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { count, seedProject, seedTicket } from "../../test/fixtures";
import { testCtx, withEmit } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { caught } from "../../test/helpers/errors.ts";
import { ghStub } from "../../test/helpers/gh-stub.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { withTx } from "../db/tx.ts";
import { createGhRunner } from "../gh/run.ts";
import { link, parsePullRequestUrl, prepareLink } from "./pullRequests.ts";

// A pull request URL names the owner, the repository, and the number. Any
// other GitHub URL is INVALID_PR_URL, and the service refuses it before it
// spawns gh.

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
const stub = () => {
	const handle = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-url-")), {});
	restores.push(handle.restore);
	return handle;
};

describe("parsePullRequestUrl", () => {
	test("every GitHub pull request URL form parses to owner, repo, and number", () => {
		const expected = { owner: "o", repo: "r", number: 12 };
		expect(parsePullRequestUrl("https://github.com/o/r/pull/12")).toEqual(expected);
		expect(parsePullRequestUrl("https://github.com/o/r/pull/12/")).toEqual(expected);
		expect(parsePullRequestUrl("https://github.com/o/r/pull/12/files")).toEqual(expected);
		expect(parsePullRequestUrl("https://github.com/o/r/pull/12?w=1")).toEqual(expected);
		expect(parsePullRequestUrl("https://github.com/o/r/pull/12#discussion_r1")).toEqual(expected);
		expect(parsePullRequestUrl("https://github.com/O/R/pull/12")).toEqual(expected);
	});
});

describe("link with a URL that is not a pull request", () => {
	test("a URL that is not a pull request is INVALID_PR_URL", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
		const handle = stub();
		const ctx = testCtx({ db: h.db, home, gh: createGhRunner() }).ctx;
		const urls = [
			"https://github.com/o/r/issues/12",
			"https://github.com/o/r",
			"https://github.com/o/r/pull/",
			"banana",
		];

		for (const url of urls) {
			expect(parsePullRequestUrl(url)).toBeNull();
			const error = await caught(
				prepareLink(ctx, { ticket: "CDE-1", url }).then((prepared) =>
					withTx(h.db, (tx, emit) => link(withEmit(ctx, emit), tx, prepared)),
				),
			);
			expect(error.code).toBe("INVALID_PR_URL");
		}

		expect(handle.spawns()).toEqual([]);
		expect(await count(h.db, "pull_requests")).toBe(0);
		expect(await count(h.db, "ticket_pull_requests")).toBe(0);
	});
});
