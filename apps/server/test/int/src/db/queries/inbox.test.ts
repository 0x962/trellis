import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { inbox } from "../../../../../src/db/queries/inbox.ts";
import {
	claude,
	dana,
	hoursAgo,
	linkPr,
	seedActivity,
	seedPr,
	seedProject,
	seedRootWithStatuses,
	seedTicket,
} from "../../../../fixtures";
import { freshDb, type TestDb } from "../../../../helpers/db.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof inbox>[1];

const defaults = () => ({ stalledBefore: hoursAgo(48), todayStart: hoursAgo(6) });

const run = (input: Partial<Input> = {}) => h.db.transaction((tx) => inbox(tx, { ...defaults(), ...input }));

const ids = (section: { items: Array<{ id: string }> }) => section.items.map((item) => item.id);

const seedIn =
	(rootId: string) =>
	(statusId: string, extra: Record<string, unknown> = {}) =>
		seedTicket(h.db, { projectId: rootId, rootId, statusId, ...extra });

describe("inbox", () => {
	test("inbox review lists human-review tickets oldest first", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = seedIn(rootId);
		const newest = await seed(statuses.humanReview, { updatedAt: hoursAgo(1) });
		const oldest = await seed(statuses.humanReview, { updatedAt: hoursAgo(3) });
		const middle = await seed(statuses.humanReview, { updatedAt: hoursAgo(2) });
		await seed(statuses.agentReview);
		await seed(statuses.started);
		const { review } = await run();
		expect(ids(review)).toEqual([oldest, middle, newest]);
		expect(review.total).toBe(3);
	});

	test("inbox failingCi lists open tickets with a failing PR", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = seedIn(rootId);
		const failing = await seed(statuses.started);
		const passing = await seed(statuses.started);
		const pending = await seed(statuses.started);
		const completed = await seed(statuses.done, { completedAt: hoursAgo(1) });
		await linkPr(h.db, failing, await seedPr(h.db, { number: 1, ciState: "fail" }));
		await linkPr(h.db, passing, await seedPr(h.db, { number: 2, ciState: "pass" }));
		await linkPr(h.db, pending, await seedPr(h.db, { number: 3, ciState: "pending" }));
		await linkPr(h.db, completed, await seedPr(h.db, { number: 4, ciState: "fail" }));
		const { failingCi } = await run();
		expect(ids(failingCi)).toEqual([failing]);
		expect(failingCi.total).toBe(1);
	});

	test("inbox stalled lists started tickets older than the threshold", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = seedIn(rootId);
		const stale = await seed(statuses.started, { updatedAt: hoursAgo(72) });
		await seed(statuses.started, { updatedAt: hoursAgo(1) });
		await seed(statuses.todo, { updatedAt: hoursAgo(72) });
		const { stalled } = await run({ stalledBefore: hoursAgo(48) });
		expect(ids(stalled)).toEqual([stale]);
		expect(stalled.total).toBe(1);
	});

	test("inbox doneByAgentsToday reads agent done activity since the day start", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = seedIn(rootId);
		const byClaude = await seed(statuses.done);
		const byDana = await seed(statuses.done);
		const yesterday = await seed(statuses.done);
		const done = (ticketId: string, actor: typeof claude, createdAt: Date) =>
			seedActivity(h.db, {
				rootId,
				projectId: rootId,
				ticketId,
				actor,
				action: "ticket.moved",
				field: "status",
				meta: { toCategory: "done" },
				createdAt,
			});
		await done(byClaude, claude, hoursAgo(2));
		await done(byClaude, claude, hoursAgo(1));
		await done(byDana, dana, hoursAgo(1));
		await done(yesterday, claude, hoursAgo(30));
		const { doneByAgentsToday } = await run({ todayStart: hoursAgo(6) });
		expect(ids(doneByAgentsToday)).toEqual([byClaude]);
		expect(doneByAgentsToday.total).toBe(1);
	});

	test("inbox caps each section at 100 items and totals the rest", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = seedIn(rootId);
		for (let i = 0; i < 130; i++) await seed(statuses.humanReview);
		const { review } = await run();
		expect(review.items).toHaveLength(100);
		expect(review.total).toBe(130);
	});

	test("inbox narrows to the project subtree", async () => {
		const cde = await seedProject(h.db, "CDE");
		const ops = await seedRootWithStatuses(h.db, "OPS");
		const inCde = await seedIn(cde.rootId)(cde.statuses.humanReview);
		const staleCde = await seedIn(cde.rootId)(cde.statuses.started, { updatedAt: hoursAgo(72) });
		await seedIn(ops.rootId)(ops.statuses.humanReview);
		await seedIn(ops.rootId)(ops.statuses.started, { updatedAt: hoursAgo(72) });
		const result = await run({ projectIds: [cde.rootId] });
		expect(ids(result.review)).toEqual([inCde]);
		expect(ids(result.stalled)).toEqual([staleCde]);
		expect(result.failingCi.total).toBe(0);
		expect(result.doneByAgentsToday.total).toBe(0);
	});
});
