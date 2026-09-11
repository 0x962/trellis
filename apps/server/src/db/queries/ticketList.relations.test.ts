import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { claude, dana, hoursAgo, linkPr, seedActivity, seedPr, seedProject, seedTicket } from "../../../test/fixtures";
import { freshDb, type TestDb } from "../../../test/helpers/db.ts";
import { ticketList } from "./ticketList.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof ticketList>[1];

const list = (input: Input) => h.db.transaction((tx) => ticketList(tx, input));

const ids = async (input: Input) => (await list(input)).items.map((item) => item.id);

const sorted = (values: string[]) => [...values].sort();

describe("ticketList pull request and actor filters", () => {
	test("ticketList honors every pr filter value", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = () => seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
		const open = await seed();
		const draft = await seed();
		const merged = await seed();
		const closed = await seed();
		const unlinked = await seed();
		await linkPr(h.db, open, await seedPr(h.db, { number: 1, state: "open" }));
		await linkPr(h.db, draft, await seedPr(h.db, { number: 2, state: "open", isDraft: true }));
		await linkPr(h.db, merged, await seedPr(h.db, { number: 3, state: "merged" }));
		await linkPr(h.db, closed, await seedPr(h.db, { number: 4, state: "closed" }));
		const projectIds = [rootId];
		expect(sorted(await ids({ projectIds, pr: "any" }))).toEqual(sorted([open, draft, merged, closed]));
		expect(await ids({ projectIds, pr: "none" })).toEqual([unlinked]);
		expect(await ids({ projectIds, pr: "open" })).toEqual([open]);
		expect(await ids({ projectIds, pr: "draft" })).toEqual([draft]);
		expect(await ids({ projectIds, pr: "merged" })).toEqual([merged]);
		expect(await ids({ projectIds, pr: "closed" })).toEqual([closed]);
	});

	test("ticketList honors the ci list with the worst state per ticket", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = () => seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
		const pass = await seed();
		const fail = await seed();
		const pending = await seed();
		const none = await seed();
		const mixed = await seed();
		await linkPr(h.db, pass, await seedPr(h.db, { number: 1, ciState: "pass" }));
		await linkPr(h.db, fail, await seedPr(h.db, { number: 2, ciState: "fail" }));
		await linkPr(h.db, pending, await seedPr(h.db, { number: 3, ciState: "pending" }));
		await linkPr(h.db, none, await seedPr(h.db, { number: 4, ciState: "none" }));
		await linkPr(h.db, mixed, await seedPr(h.db, { number: 5, ciState: "pass" }));
		await linkPr(h.db, mixed, await seedPr(h.db, { number: 6, ciState: "fail" }));
		const page = await ids({ projectIds: [rootId], ci: ["fail", "pending"] });
		expect(sorted(page)).toEqual(sorted([fail, pending, mixed]));
	});

	test("ticketList matches the actor filter against the last actor", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const a = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
		const b = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
		const claudeAt = hoursAgo(2);
		const danaAt = hoursAgo(1);
		await seedActivity(h.db, { rootId, projectId: rootId, ticketId: a, actor: claude, createdAt: claudeAt });
		await seedActivity(h.db, { rootId, projectId: rootId, ticketId: b, actor: claude, createdAt: claudeAt });
		await seedActivity(h.db, { rootId, projectId: rootId, ticketId: b, actor: dana, createdAt: danaAt });
		const projectIds = [rootId];
		expect(await ids({ projectIds, actor: "agent:claude" })).toEqual([a]);
		expect(await ids({ projectIds, actor: "claude" })).toEqual([a]);
		expect(await ids({ projectIds, actor: "dana" })).toEqual([b]);

		const page = await list({ projectIds });
		const rowA = page.items.find((item) => item.id === a)!;
		const rowB = page.items.find((item) => item.id === b)!;
		expect(rowA.lastActor).toEqual({ name: "claude", kind: "agent", at: claudeAt.toISOString() });
		expect(rowB.lastActor).toEqual({ name: "dana", kind: "human", at: danaAt.toISOString() });
	});
});

describe("ticketList ancestors", () => {
	test("a summary names every ticket above it, the top of the tree first", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (parentId?: string) =>
			seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started, parentId });
		const top = await seed();
		const middle = await seed(top);
		const leaf = await seed(middle);

		const items = (await list({ projectIds: [rootId] })).items;
		const of = (id: string) => items.find((item) => item.id === id)!;
		expect(of(top).ancestors).toEqual([]);
		expect(of(middle).ancestors).toEqual([of(top).identifier]);
		expect(of(leaf).ancestors).toEqual([of(top).identifier, of(middle).identifier]);
	});
});
