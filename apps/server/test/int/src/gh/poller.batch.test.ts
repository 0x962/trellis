import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { graphqlReply, seedProject } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import {
	aliasCount,
	authReply,
	errorsReply,
	pollerHarness,
	queriedRefs,
	refKey,
	seedLinkedPr,
	spawnKey,
} from "../../../helpers/poller.ts";
import { fetchDiff } from "../../../../src/gh/diff.ts";
import * as poller from "../../../../src/gh/poller.ts";

// One `gh api graphql` request carries up to 50 pull requests, so a tick
// spawns one process per 50 due pull requests whatever number of repositories
// they sit in. Alias prN answers the ref at index N, so every answer lands on
// the row of its own pull request.
//
// The poller runs on the poller slots. A person who opens a diff takes the
// interactive slot and never waits for the tick.

const REPOS = ["web", "api", "docs"];

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});

const harness = (replies: Record<string, { stdout: string; stderr: string; exitCode: number; delayMs?: number }>) => {
	const p = pollerHarness(h.db, { "auth status": authReply, ...replies });
	restores.push(p.restore);
	return p;
};

// `count` due pull requests, spread over the three repositories, each linked
// to its own started ticket.
const seedDue = async (count: number) => {
	const { rootId, statuses } = await seedProject(h.db);
	for (let index = 0; index < count; index++) {
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: index + 1, repo: REPOS[index % REPOS.length] },
		});
	}
};

describe("poller batching", () => {
	test("40 due pull requests cost one gh spawn per tick", async () => {
		await seedDue(40);
		const p = harness({ "api graphql": errorsReply(50) });
		const handle = poller.start(p.hook);

		await handle.tick();

		expect(p.spawns().map(spawnKey)).toEqual(["auth status", "api graphql"]);
		const [spawn] = p.spawnsOf("api graphql");
		expect(spawn!.args.slice(0, 2)).toEqual(["api", "graphql"]);
		expect(aliasCount(spawn!)).toBe(40);
		expect(queriedRefs(spawn!)).toHaveLength(40);
		await handle.stop();
	}, 30_000);

	test("60 due pull requests split into one request of 50 and one of 10", async () => {
		await seedDue(60);
		const p = harness({ "api graphql": errorsReply(50) });
		const handle = poller.start(p.hook);

		await handle.tick();

		expect(p.countOf("api graphql")).toBe(2);
		const sizes = p
			.spawnsOf("api graphql")
			.map(aliasCount)
			.sort((a, b) => a - b);
		expect(sizes).toEqual([10, 50]);
		await handle.stop();
	}, 30_000);

	test("every alias in the batch writes the row of its own pull request", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, { projectId: rootId, rootId, statusId: statuses.started, pr: { number: 7 } });
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 7, repo: "api" },
		});
		const p = harness({
			"api graphql": graphqlReply([
				{ number: 7, url: "https://github.com/acme/web/pull/7" },
				{ number: 7, url: "https://github.com/acme/api/pull/7" },
			]),
		});
		const handle = poller.start(p.hook);

		await handle.tick();

		const rows = (await h.db.execute(sql`SELECT owner, repo, number, content_hash FROM pull_requests ORDER BY repo`))
			.rows as Array<Record<string, unknown>>;
		expect(rows.map((row) => refKey(row.owner as string, row.repo as string, row.number as number))).toEqual([
			refKey("acme", "api", 7),
			refKey("acme", "web", 7),
		]);
		expect(rows.every((row) => row.content_hash !== null)).toBe(true);
		await handle.stop();
	});

	test("the poller spawns gh through the poller slots only", async () => {
		await seedDue(1);
		const p = harness({
			"api graphql": { ...errorsReply(1), delayMs: 300 },
			"pr diff": { stdout: "diff --git a/a.ts b/a.ts\n", stderr: "", exitCode: 0 },
		});
		const handle = poller.start(p.hook);

		const ticking = handle.tick().then(() => "tick" as const);
		const diffing = fetchDiff(p.hook.gh, "https://github.com/acme/web/pull/1").then(() => "diff" as const);

		expect(await Promise.race([ticking, diffing])).toBe("diff");
		await ticking;
		expect(p.countOf("pr diff")).toBe(1);
		expect(p.countOf("api graphql")).toBe(1);
		await handle.stop();
	});
});
