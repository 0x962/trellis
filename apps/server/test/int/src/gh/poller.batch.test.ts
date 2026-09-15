import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { fetchDiff } from "../../../../src/gh/diff.ts";
import * as poller from "../../../../src/gh/poller.ts";
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

// One `gh api graphql` request carries up to 10 pull requests, so a tick
// spawns one process per 10 due pull requests whatever number of repositories
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
	test("40 due pull requests use four batches of ten", async () => {
		await seedDue(40);
		const p = harness({ "api graphql": errorsReply(50) });
		const handle = poller.start(p.hook);

		await handle.tick();

		expect(p.spawns().map(spawnKey)).toEqual(["auth status", ...Array(4).fill("api graphql")]);
		const [spawn] = p.spawnsOf("api graphql");
		expect(spawn!.args.slice(0, 2)).toEqual(["api", "graphql"]);
		expect(aliasCount(spawn!)).toBe(10);
		expect(queriedRefs(spawn!)).toHaveLength(10);
		await handle.stop();
	}, 30_000);

	test("60 due pull requests split into six batches of ten", async () => {
		await seedDue(60);
		const p = harness({ "api graphql": errorsReply(50) });
		const handle = poller.start(p.hook);

		await handle.tick();

		expect(p.countOf("api graphql")).toBe(6);
		const sizes = p
			.spawnsOf("api graphql")
			.map(aliasCount)
			.sort((a, b) => a - b);
		expect(sizes).toEqual([10, 10, 10, 10, 10, 10]);
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

test("a gateway timeout retains its message and permits the next batch without an auth failure", async () => {
	await seedDue(11);
	const p = harness({});
	const original = p.hook.gh;
	let batches = 0;
	p.hook.gh = Object.assign(
		async (slot: Parameters<typeof original>[0], args: string[]) => {
			if (args[0] === "api" && args[1] === "graphql" && ++batches === 1)
				return { ok: false as const, reason: "error" as const, code: 1, stdout: "", message: "gh: HTTP 504" };
			if (args[0] === "api" && args[1] === "graphql") {
				const refs = queriedRefs({ args, env: {}, at: 0, pid: 0 });
				p.stub.reply(
					"api graphql",
					graphqlReply(
						refs.map((ref) => {
							const [repository, number] = ref.split("#");
							return { number: Number(number), url: `https://github.com/${repository}/pull/${number}` };
						}),
					),
				);
			}
			return original(slot, args);
		},
		{ bin: original.bin, timeoutMs: original.timeoutMs },
	);
	const handle = poller.start(p.hook);
	await handle.tick();
	const rows = (await h.db.execute(sql`SELECT fetch_error, content_hash FROM pull_requests ORDER BY id`)).rows;
	expect(batches).toBe(2);
	expect(rows.filter((row) => row.fetch_error === "gh: HTTP 504")).toHaveLength(10);
	expect(rows[10]!.content_hash).not.toBeNull();
	expect(p.events.filter((event) => event.type === "gh.status" && !event.ok)).toEqual([]);
	expect(JSON.stringify(p.logs)).toContain("gh: HTTP 504");
	await p.clock.advance(10_000);
	expect(batches).toBe(2);
	await handle.stop();
});

test("a successful unchanged PR clears its prior fetch error", async () => {
	await seedDue(1);
	const p = harness({ "api graphql": graphqlReply([{ number: 1 }]) });
	const handle = poller.start(p.hook);
	await handle.tick();
	const before = (await h.db.execute(sql`SELECT content_hash FROM pull_requests`)).rows[0]!.content_hash;
	await h.db.execute(sql`UPDATE pull_requests SET fetch_error='gh: HTTP 504'`);
	await p.clock.advance(120_000);
	const after = (await h.db.execute(sql`SELECT content_hash,fetch_error FROM pull_requests`)).rows[0]!;
	expect(after.content_hash).toBe(before);
	expect(after.fetch_error).toBeNull();
	await handle.stop();
});
