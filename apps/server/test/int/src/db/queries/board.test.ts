import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { board } from "../../../../../src/db/queries/board.ts";
import { ticketList } from "../../../../../src/db/queries/ticketList.ts";
import { type StatusIds, seedProject, seedTicket } from "../../../../fixtures";
import { freshDb, type TestDb } from "../../../../helpers/db.ts";
import { countStatements } from "../../../../helpers/statements.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof board>[1];

const run = (input: Input) => h.db.transaction((tx) => board(tx, input));

// The column set comes from the cache's effective statuses in position order.
const columnsOf = (statuses: StatusIds) => Object.values(statuses);

// A fixed base time, so a seeded update time never depends on the clock.
const START = Date.parse("2026-01-01T00:00:00.000Z");
const at = (minutes: number) => new Date(START + minutes * 60_000);

describe("board", () => {
	test("board returns one column per effective status including empty ones", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const filled = [statuses.todo, statuses.started, statuses.agentReview, statuses.humanReview, statuses.done];
		for (const statusId of filled) await seedTicket(h.db, { projectId: rootId, rootId, statusId });
		const { columns } = await run({ projectIds: [rootId], statusIds: columnsOf(statuses) });
		expect(columns.map((column) => column.statusId)).toEqual(columnsOf(statuses));
		expect(columns.map((column) => column.count)).toEqual([1, 1, 1, 1, 1, 0]);
		expect(columns.at(-1)?.items).toEqual([]);
	});

	// A column lists the ticket that changed last at the top. Two tickets
	// that changed at the same time order by id, the newest id first.
	test("board lists a column by the last update, newest first, and breaks a tie by id descending", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (minutes: number) =>
			seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, updatedAt: at(minutes) });
		const oldest = await seed(0);
		const tieFirst = await seed(5);
		const tieSecond = await seed(5);
		const newest = await seed(9);
		const { columns } = await run({ projectIds: [rootId], statusIds: columnsOf(statuses) });
		const column = columns.find((column) => column.statusId === statuses.todo)!;
		const tied = [tieFirst, tieSecond].sort((a, b) => (a < b ? 1 : -1));
		expect(column.items.map((item) => item.id)).toEqual([newest, ...tied, oldest]);
	});

	test("board caps items at 100 per column and counts the whole column", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seeded: Array<{ id: string; minutes: number }> = [];
		for (let i = 0; i < 130; i++) {
			const minutes = i % 13;
			const id = await seedTicket(h.db, {
				projectId: rootId,
				rootId,
				statusId: statuses.started,
				updatedAt: at(minutes),
			});
			seeded.push({ id, minutes });
		}
		const expected = seeded
			.sort((a, b) => b.minutes - a.minutes || (a.id < b.id ? 1 : -1))
			.map((row) => row.id)
			.slice(0, 100);
		const { columns } = await run({ projectIds: [rootId], statusIds: columnsOf(statuses) });
		const column = columns.find((column) => column.statusId === statuses.started)!;
		expect(column.count).toBe(130);
		expect(column.items.map((item) => item.id)).toEqual(expected);
	});

	test("board honors the list filters", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const urgent: string[] = [];
		for (const statusId of [statuses.todo, statuses.started, statuses.done]) {
			urgent.push(await seedTicket(h.db, { projectId: rootId, rootId, statusId, priority: "urgent" }));
			await seedTicket(h.db, { projectId: rootId, rootId, statusId, priority: "low" });
		}
		const { columns } = await run({ projectIds: [rootId], statusIds: columnsOf(statuses), priority: ["urgent"] });
		expect(columns.reduce((sum, column) => sum + column.count, 0)).toBe(3);
		const shown = columns.flatMap((column) => column.items.map((item) => item.id));
		expect(shown.sort()).toEqual([...urgent].sort());
	});

	test("board honors the category and reviewer filters", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (statusId: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId });
		await seed(statuses.todo);
		const started = await seed(statuses.started);
		const human = await seed(statuses.humanReview);
		await seed(statuses.agentReview);
		const statusIds = columnsOf(statuses);
		const shown = (columns: Awaited<ReturnType<typeof run>>["columns"]) =>
			columns.flatMap((column) => column.items.map((item) => item.id)).sort();
		const byCategory = await run({ projectIds: [rootId], statusIds, categories: ["started"] });
		expect(byCategory.columns.map((column) => column.count)).toEqual([0, 1, 0, 0, 0, 0]);
		expect(shown(byCategory.columns)).toEqual([started]);
		const byReviewer = await run({ projectIds: [rootId], statusIds, reviewer: "human" });
		expect(shown(byReviewer.columns)).toEqual([human]);
	});

	// The board shows the first 100 by (updated_at desc, id desc) and more come
	// through `list` with `status=`. Both order equal update times the same way,
	// so the list's first page is the board's column and its second page starts
	// where the column stopped.
	test("board and list agree on the order of equal update times", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seeded: string[] = [];
		for (let i = 0; i < 101; i++) {
			seeded.push(await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started, updatedAt: at(0) }));
		}
		const { columns } = await run({ projectIds: [rootId], statusIds: columnsOf(statuses) });
		const column = columns.find((column) => column.statusId === statuses.started)!;
		const shown = column.items.map((item) => item.id);
		const list = (cursor?: string) =>
			h.db.transaction((tx) =>
				ticketList(tx, { projectIds: [rootId], statusIds: [statuses.started], sort: "-updatedAt", limit: 100, cursor }),
			);
		const first = await list();
		expect(first.items.map((item) => item.id)).toEqual(shown);
		const second = await list(first.nextCursor!);
		expect(second.items.map((item) => item.id)).toEqual(seeded.filter((id) => !shown.includes(id)));
		expect(second.nextCursor).toBeNull();
	});

	test("board runs as one query", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		await h.db.transaction(async (tx) => {
			const statements = await countStatements(h.db.$client, () =>
				board(tx, { projectIds: [rootId], statusIds: columnsOf(statuses) }),
			);
			expect(statements).toBe(1);
		});
	});
});
