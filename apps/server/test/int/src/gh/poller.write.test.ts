import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { contentHash } from "../../../../src/gh/graphql.ts";
import * as poller from "../../../../src/gh/poller.ts";
import { checkRun, graphqlReply, linkPr, rawPullRequest, seedPr, seedProject, seedTicket } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import {
	authReply,
	BASE,
	pollerHarness,
	queriedRefs,
	refKey,
	seededContent,
	seedLinkedPr,
} from "../../../helpers/poller.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

// A fetch writes the row only when the content hash changed. A written row
// emits one pr.updated event with every linked ticket. A state or ci state
// change writes one pr.state_changed activity row per linked ticket, as the
// system actor `trellis`. A poller write bumps the ticket version so a stale
// client cache loses, and leaves updated_at, because no person acted.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterEach(() => h.db.transaction(assertStatusInvariant));
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

type PrRow = Record<string, unknown>;

const prRows = async () => (await h.db.execute(sql`SELECT * FROM pull_requests ORDER BY repo, number`)).rows as PrRow[];

const activityRows = async () =>
	(await h.db.execute(sql`SELECT * FROM activity ORDER BY id`)).rows as Array<Record<string, unknown>>;

describe("poller writes", () => {
	test("an unchanged content hash writes no row, no event, and no activity", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 12 },
			row: { fetched_at: BASE, updated_at: BASE, content_hash: contentHash(seededContent({ number: 12 })) },
		});
		const p = harness({ "api graphql": graphqlReply([{ number: 12, headRefName: "feature" }]) });
		const handle = poller.start(p.hook);

		await handle.tick();

		const [row] = await prRows();
		expect(new Date(row!.updated_at as string).getTime()).toBe(BASE.getTime());
		expect(p.events).toEqual([]);
		expect(await activityRows()).toEqual([]);
		await handle.stop();
	});

	test("a changed title writes the row and emits pr.updated without activity", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const { ticket, pr } = await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 13 },
			row: { fetched_at: BASE, content_hash: contentHash(seededContent({ number: 13 })) },
		});
		const p = harness({
			"api graphql": graphqlReply([{ number: 13, title: "Fresh", headRefName: "feature" }]),
		});
		const handle = poller.start(p.hook);

		await handle.tick();

		const [row] = await prRows();
		expect(row!.title).toBe("Fresh");
		expect(row!.content_hash).not.toBe(contentHash(seededContent({ number: 13 })));
		expect(p.events).toEqual([
			{ type: "pr.updated", id: pr, ticketIds: [ticket], projectIds: [rootId], state: "open", ciState: "none" },
		]);
		expect(await activityRows()).toEqual([]);
		await handle.stop();
	});

	test("a ci state change writes pr.state_changed activity as system trellis", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const { pr } = await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 14, ciState: "pending", checks: [{ name: "test", workflow: "ci", bucket: "pending", link: null }] },
			row: { fetched_at: BASE },
		});
		const p = harness({
			"api graphql": graphqlReply([{ number: 14, checks: [checkRun("test", "SUCCESS", "ci")] }]),
		});
		const handle = poller.start(p.hook);

		await handle.tick();

		const [row] = await prRows();
		expect(row!.ci_state).toBe("pass");
		expect(p.events).toHaveLength(1);
		expect(p.events[0]).toMatchObject({ type: "pr.updated", id: pr, ciState: "pass" });
		const activity = await activityRows();
		expect(activity).toHaveLength(1);
		expect(activity[0]).toMatchObject({ action: "pr.state_changed", actor_name: "trellis", actor_kind: "system" });
		expect(activity[0]!.meta).toMatchObject({ from: "open/pending", to: "open/pass" });
		await handle.stop();
	});

	test("a pull request that merged writes one state change row per linked ticket", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const first = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
		const second = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
		const pr = await seedPr(h.db, { number: 15 }, { fetched_at: BASE });
		await linkPr(h.db, first, pr);
		await linkPr(h.db, second, pr);
		const p = harness({ "api graphql": graphqlReply([{ number: 15, state: "MERGED", headRefName: "feature" }]) });
		const handle = poller.start(p.hook);

		await handle.tick();

		const [row] = await prRows();
		expect(row!.state).toBe("merged");
		expect(p.events).toHaveLength(1);
		expect(p.events[0]).toMatchObject({ type: "pr.updated", id: pr, state: "merged" });
		expect((p.events[0] as { ticketIds: string[] }).ticketIds.sort()).toEqual([first, second].sort());
		const activity = await activityRows();
		expect(activity).toHaveLength(2);
		expect(activity.map((entry) => entry.ticket_id).sort()).toEqual([first, second].sort());
		for (const entry of activity) {
			expect(entry).toMatchObject({ action: "pr.state_changed", actor_name: "trellis", actor_kind: "system" });
			expect(entry.meta).toMatchObject({ from: "open/none", to: "merged/none" });
		}
		await handle.stop();
	});

	test("a poller write bumps the ticket version and leaves updated_at", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const ticket = await seedTicket(
			h.db,
			{ projectId: rootId, rootId, statusId: statuses.started },
			{ version: 3, updated_at: BASE },
		);
		const pr = await seedPr(h.db, { number: 16 }, { fetched_at: BASE });
		await linkPr(h.db, ticket, pr);
		const p = harness({ "api graphql": graphqlReply([{ number: 16, title: "Fresh", headRefName: "feature" }]) });
		const handle = poller.start(p.hook);

		await handle.tick();

		const [row] = (await h.db.execute(sql`SELECT version, updated_at FROM tickets WHERE id = ${ticket}`)).rows;
		expect(row!.version).toBe(4);
		expect(new Date(row!.updated_at as string).getTime()).toBe(BASE.getTime());
		await handle.stop();
	});

	test("a pull request gh could not answer stores fetch_error and keeps its cadence", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, { projectId: rootId, rootId, statusId: statuses.started, pr: { number: 7 } });
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 7, repo: "api" },
		});
		const p = harness({
			"api graphql": {
				stdout: JSON.stringify({
					data: {
						pr0: { pullRequest: rawPullRequest({ number: 7, title: "Fresh", headRefName: "feature" }) },
						pr1: null,
					},
					errors: [{ message: "Could not resolve to a Repository", path: ["pr1"] }],
				}),
				stderr: "",
				exitCode: 0,
			},
		});
		const handle = poller.start(p.hook);

		await handle.tick();

		const rows = await prRows();
		const written = rows.filter((row) => row.fetch_error === null);
		const failed = rows.filter((row) => row.fetch_error !== null);
		expect(written).toHaveLength(1);
		expect(written[0]!.title).toBe("Fresh");
		expect(failed).toHaveLength(1);
		expect(failed[0]!.title).toBe("PR 7");
		expect(failed[0]!.fetch_error).toContain("Could not resolve");
		expect(p.events).toHaveLength(1);
		expect(p.events[0]).toMatchObject({ type: "pr.updated", id: written[0]!.id as string });
		expect(await activityRows()).toEqual([]);

		await p.clock.advance(130_000);
		const retried = p
			.spawnsOf("api graphql")
			.slice(1)
			.flatMap((spawn) => queriedRefs(spawn));
		expect(retried).toContain(refKey(failed[0]!.owner as string, failed[0]!.repo as string, 7));
		await handle.stop();
	});
});
