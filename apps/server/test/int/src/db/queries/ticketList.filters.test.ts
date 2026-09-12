import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { filterWhere } from "../../../../../src/db/queries/ticketFilters.ts";
import { ticketList } from "../../../../../src/db/queries/ticketList.ts";
import { seedChild, seedProject, seedRootWithStatuses, seedTicket } from "../../../../fixtures";
import { freshDb, type TestDb } from "../../../../helpers/db.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof ticketList>[1];

const ids = async (input: Input) => {
	const page = await h.db.transaction((tx) => ticketList(tx, input));
	return page.items.map((item) => item.id);
};

const sorted = (values: string[]) => [...values].sort();

describe("ticketList filters", () => {
	test("ticketList filters by project_id = ANY of the resolved ids", async () => {
		const { rootId: cde, statuses } = await seedProject(h.db);
		const web = await seedChild(h.db, cde, cde, "web");
		const auth = await seedChild(h.db, web, cde, "auth");
		await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: statuses.todo });
		const inWeb = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: statuses.todo });
		const inAuth = await seedTicket(h.db, { projectId: auth, rootId: cde, statusId: statuses.todo });
		expect(sorted(await ids({ projectIds: [web, auth] }))).toEqual(sorted([inWeb, inAuth]));
		expect(await ids({ projectIds: [web] })).toEqual([inWeb]);
	});

	test("ticketList honors the status, category, and reviewer filters", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (statusId: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId });
		const todo = await seed(statuses.todo);
		const started = await seed(statuses.started);
		const humanReview = await seed(statuses.humanReview);
		const agentReview = await seed(statuses.agentReview);
		const done = await seed(statuses.done);
		const projectIds = [rootId];
		expect(sorted(await ids({ projectIds, statusIds: [statuses.todo, statuses.done] }))).toEqual(sorted([todo, done]));
		expect(sorted(await ids({ projectIds, categories: ["started", "review"] }))).toEqual(
			sorted([started, humanReview, agentReview]),
		);
		expect(await ids({ projectIds, reviewer: "human" })).toEqual([humanReview]);
	});

	test("ticketList honors the priority list", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const byPriority: Record<string, string> = {};
		for (const priority of ["none", "urgent", "high", "medium", "low"]) {
			byPriority[priority] = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, priority });
		}
		const page = await ids({ projectIds: [rootId], priority: ["urgent", "high"] });
		expect(sorted(page)).toEqual(sorted([byPriority.urgent!, byPriority.high!]));
	});

	test("ticketList honors parent none and a parent id", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const parent = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		const childA = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, parentId: parent });
		const childB = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, parentId: parent });
		const top = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		expect(sorted(await ids({ projectIds: [rootId], parent: "none" }))).toEqual(sorted([parent, top]));
		expect(sorted(await ids({ projectIds: [rootId], parent }))).toEqual(sorted([childA, childB]));
	});

	// The list query matches the stemmed lexemes with a prefix on the last
	// token. `auth:*` matches `authent` and `authservic`; `servic:*` matches
	// neither, because a prefix match starts at the first letter of a lexeme.
	test("ticketList q uses FTS with a prefix on the last token and no trigram", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (title: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title });
		const authentication = await seed("Authentication flow");
		const authService = await seed("AuthService refactor");
		await seed("Billing");
		expect(sorted(await ids({ projectIds: [rootId], q: "auth" }))).toEqual(sorted([authentication, authService]));
		expect(await ids({ projectIds: [rootId], q: "servic" })).toEqual([]);
	});

	// `OR` binds weaker than the space between words, so `login or billing`
	// finds either title. A lowercase `or` is the same operator.
	test("ticketList q keeps OR semantics before the prefixed last token", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (title: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title });
		const login = await seed("Login page");
		const billing = await seed("Billing token");
		await seed("Widget");
		expect(sorted(await ids({ projectIds: [rootId], q: "login or billing" }))).toEqual(sorted([login, billing]));
		expect(sorted(await ids({ projectIds: [rootId], q: "login OR billing token" }))).toEqual(sorted([login, billing]));
	});

	test("ticketList narrows to the roots of rootIds", async () => {
		const cde = await seedProject(h.db, "CDE");
		const ops = await seedRootWithStatuses(h.db, "OPS");
		const inCde = await seedTicket(h.db, { projectId: cde.rootId, rootId: cde.rootId, statusId: cde.statuses.todo });
		const inOps = await seedTicket(h.db, { projectId: ops.rootId, rootId: ops.rootId, statusId: ops.statuses.todo });
		expect(await ids({ rootIds: [cde.rootId] })).toEqual([inCde]);
		expect(await ids({ rootIds: [ops.rootId], projectIds: [ops.rootId] })).toEqual([inOps]);
		expect(sorted(await ids({ rootIds: [cde.rootId, ops.rootId] }))).toEqual(sorted([inCde, inOps]));
	});

	// A ticket in a todo, started, or review status has no completed_at, so a
	// filter on open categories only is a filter on `completed_at IS NULL`,
	// and the default table query walks tickets_open_idx in updated_at order
	// instead of sorting every ticket of the root.
	test("an open category filter with a root walks the open partial index", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		for (const statusId of [statuses.todo, statuses.started, statuses.done]) {
			await seedTicket(h.db, { projectId: rootId, rootId, statusId });
		}
		const explain = async (filter: Parameters<typeof filterWhere>[0]) =>
			h.db.transaction(async (tx) => {
				await tx.execute(sql`SET LOCAL enable_seqscan = off`);
				const result = await tx.execute(
					sql`EXPLAIN SELECT t.id FROM tickets t WHERE ${filterWhere(filter)} ORDER BY t.updated_at DESC LIMIT 50`,
				);
				return result.rows.map((row) => row["QUERY PLAN"] as string).join("\n");
			});
		const active = { rootIds: [rootId], projectIds: [rootId], categories: ["todo", "started", "review"] as const };
		expect(await explain(active)).toContain("tickets_open_idx");
		expect(await explain({ rootIds: [rootId], projectIds: [rootId] })).not.toContain("tickets_open_idx");
		expect(await explain({ rootIds: [rootId], categories: ["todo", "done"] })).not.toContain("tickets_open_idx");
	});

	// Each ticket gets three different dates, one per column, so a bound
	// that reads the wrong column selects a different set.
	test("ticketList treats updated, created, and completed as after bounds", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const day = (n: number) => new Date(`2026-09-0${n}T12:00:00Z`);
		const seed = (createdAt: Date, updatedAt: Date, completedAt: Date) =>
			seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.done, createdAt, updatedAt, completedAt });
		const a = await seed(day(1), day(4), day(7));
		const b = await seed(day(2), day(5), day(8));
		const c = await seed(day(3), day(6), day(9));
		const bound = (n: number) => day(n).toISOString();
		expect(sorted(await ids({ projectIds: [rootId], created: bound(2) }))).toEqual(sorted([b, c]));
		expect(sorted(await ids({ projectIds: [rootId], created: bound(4) }))).toEqual([]);
		expect(sorted(await ids({ projectIds: [rootId], updated: bound(5) }))).toEqual(sorted([b, c]));
		expect(sorted(await ids({ projectIds: [rootId], updated: bound(7) }))).toEqual([]);
		expect(sorted(await ids({ projectIds: [rootId], completed: bound(8) }))).toEqual(sorted([b, c]));
		expect(sorted(await ids({ projectIds: [rootId], completed: bound(1) }))).toEqual(sorted([a, b, c]));
	});
});
