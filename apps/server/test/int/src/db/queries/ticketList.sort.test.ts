import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PrioritySchema } from "@trellis/api";
import { ticketList } from "../../../../../src/db/queries/ticketList.ts";
import { hoursAgo, seedProject, seedStatus, seedTicket } from "../../../../fixtures";
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

// The two tickets that share a value order by id descending.
const idDesc = (a: string, b: string) => [a, b].sort().reverse();

describe("ticketList sort", () => {
	test("ticketList sorts by updatedAt with id desc as the tiebreak", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (updatedAt: Date) =>
			seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, updatedAt });
		const distinct: string[] = [];
		for (const hours of [50, 40, 30, 20, 10]) distinct.push(await seed(hoursAgo(hours)));
		const equalAt = hoursAgo(5);
		const pair = idDesc(await seed(equalAt), await seed(equalAt));
		const ascending = [...distinct, ...pair];
		expect(await ids({ projectIds: [rootId], sort: "-updatedAt" })).toEqual([...pair, ...[...distinct].reverse()]);
		expect(await ids({ projectIds: [rootId], sort: "updatedAt" })).toEqual(ascending);
	});

	test("ticketList sorts priority by rank", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const byPriority = new Map<string, string>();
		for (const priority of ["low", "none", "urgent", "medium", "high"]) {
			byPriority.set(
				priority,
				await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, priority }),
			);
		}
		const ranked = ["urgent", "high", "medium", "low", "none"].map((priority) => byPriority.get(priority)!);
		expect(PrioritySchema.options).toEqual(["none", "urgent", "high", "medium", "low"]);
		expect(await ids({ projectIds: [rootId], sort: "priority" })).toEqual(ranked);
		expect(await ids({ projectIds: [rootId], sort: "-priority" })).toEqual([...ranked].reverse());
	});

	test("ticketList sorts status by category rank, position, and id", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const startedLate = await seedStatus(h.db, {
			projectId: rootId,
			name: "Started B",
			category: "started",
			position: 6,
		});
		const seed = (statusId: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId });
		const canceled = await seed(statuses.canceled);
		const done = await seed(statuses.done);
		const lateStarted = await seed(startedLate);
		const review = await seed(statuses.humanReview);
		const startedTwins = idDesc(await seed(statuses.started), await seed(statuses.started));
		const todo = await seed(statuses.todo);
		expect(await ids({ projectIds: [rootId], sort: "status" })).toEqual([
			todo,
			...startedTwins,
			lateStarted,
			review,
			done,
			canceled,
		]);
	});

	test("ticketList sorts by number, createdAt, and position in both directions", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seeded: Array<{ id: string; number: number; createdAt: Date; position: number }> = [];
		const numbers = [3, 1, 4, 5, 2];
		for (const [index, number] of numbers.entries()) {
			const createdAt = hoursAgo(10 - index);
			const position = [500, 100, 300, 200, 400][index]!;
			const id = await seedTicket(h.db, {
				projectId: rootId,
				rootId,
				statusId: statuses.todo,
				number,
				createdAt,
				position,
			});
			seeded.push({ id, number, createdAt, position });
		}
		const by = (key: "number" | "createdAt" | "position") =>
			[...seeded].sort((a, b) => Number(a[key]) - Number(b[key])).map((row) => row.id);
		const projectIds = [rootId];
		expect(await ids({ projectIds, sort: "number" })).toEqual(by("number"));
		expect(await ids({ projectIds, sort: "-number" })).toEqual(by("number").reverse());
		expect(await ids({ projectIds, sort: "createdAt" })).toEqual(by("createdAt"));
		expect(await ids({ projectIds, sort: "-createdAt" })).toEqual(by("createdAt").reverse());
		expect(await ids({ projectIds, sort: "position" })).toEqual(by("position"));
		expect(await ids({ projectIds, sort: "-position" })).toEqual(by("position").reverse());
	});
});
