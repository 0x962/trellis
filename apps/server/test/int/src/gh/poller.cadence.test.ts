import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { checkRun, graphqlReply, seedProject, seedRepo } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import {
	authReply,
	BASE,
	hoursBefore,
	pollerHarness,
	prListReply,
	seededContent,
	seedLinkedPr,
} from "../../../helpers/poller.ts";
import { contentHash } from "../../../../src/gh/graphql.ts";
import * as poller from "../../../../src/gh/poller.ts";

// One cadence per pull request, counted from its last fetch: 30 s while a
// check is pending, 120 s while it is open with no pending check, 10 min
// while it merged or closed inside the last day. Detection runs every 120 s.
//
// A fetch that finds the same content writes no row, so the poller holds the
// last fetch time in memory and keeps the cadence.

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

const harness = (replies: Record<string, { stdout: string; stderr: string; exitCode: number }>) => {
	const p = pollerHarness(h.db, { "auth status": authReply, ...replies });
	restores.push(p.restore);
	return p;
};

const prRow = async (id: string) =>
	(await h.db.execute(sql`SELECT title, content_hash, fetched_at, updated_at FROM pull_requests WHERE id = ${id}`))
		.rows[0] as Record<string, unknown>;

describe("poller cadence", () => {
	test("a pull request with a pending check polls every 30 seconds", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 8, ciState: "pending", checks: [{ name: "test", workflow: null, bucket: "pending", link: null }] },
			row: { fetched_at: BASE },
		});
		const p = harness({ "api graphql": graphqlReply([{ number: 8, checks: [checkRun("test", null)] }]) });
		const handle = poller.start(p.hook);

		await p.clock.advance(25_000);
		expect(p.countOf("api graphql")).toBe(0);

		await p.clock.advance(6_000);
		expect(p.countOf("api graphql")).toBe(1);
		await handle.stop();
	});

	test("an open pull request without a pending check polls every 120 seconds", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 9, ciState: "pass", checks: [{ name: "test", workflow: null, bucket: "pass", link: null }] },
			row: { fetched_at: BASE },
		});
		const p = harness({ "api graphql": graphqlReply([{ number: 9, checks: [checkRun("test", "SUCCESS")] }]) });
		const handle = poller.start(p.hook);

		await p.clock.advance(60_000);
		expect(p.countOf("api graphql")).toBe(0);

		await p.clock.advance(61_000);
		expect(p.countOf("api graphql")).toBe(1);
		await handle.stop();
	});

	test("a recently merged pull request polls every 10 minutes", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 10, state: "merged" },
			row: { fetched_at: BASE, merged_at: hoursBefore(1) },
		});
		const p = harness({ "api graphql": graphqlReply([{ number: 10, state: "MERGED" }]) });
		const handle = poller.start(p.hook);

		await p.clock.advance(300_000);
		expect(p.countOf("api graphql")).toBe(0);

		await p.clock.advance(360_000);
		expect(p.countOf("api graphql")).toBe(1);
		await handle.stop();
	}, 20_000);

	test("the last fetch time lives in memory so an unwritten row keeps its cadence", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const { pr } = await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 11 },
			row: { fetched_at: BASE, updated_at: BASE, content_hash: contentHash(seededContent({ number: 11 })) },
		});
		const p = harness({ "api graphql": graphqlReply([{ number: 11, headRefName: "feature" }]) });
		const handle = poller.start(p.hook);

		await p.clock.advance(125_000);
		expect(p.countOf("api graphql")).toBe(1);
		const row = await prRow(pr);
		expect(new Date(row.updated_at as string).getTime()).toBe(BASE.getTime());
		expect(new Date(row.fetched_at as string).getTime()).toBe(BASE.getTime());

		await p.clock.advance(110_000);
		expect(p.countOf("api graphql")).toBe(1);

		await p.clock.advance(10_000);
		expect(p.countOf("api graphql")).toBe(2);
		await handle.stop();
	}, 20_000);

	test("detection runs every 120 seconds and not on every tick", async () => {
		const { rootId } = await seedProject(h.db);
		await seedRepo(h.db, rootId, "acme", "web");
		const p = harness({ "pr list": prListReply([]) });
		const handle = poller.start(p.hook);

		await p.clock.advance(100_000);
		expect(p.countOf("pr list")).toBe(1);

		await p.clock.advance(30_000);
		expect(p.countOf("pr list")).toBe(2);
		await handle.stop();
	});
});
