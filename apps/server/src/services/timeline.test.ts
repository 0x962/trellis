import { describe, expect, test } from "bun:test";
import { TimelineListInputSchema } from "@trellis/api";
import { navid, seedActivity, seedComment, seedProject, seedTicket } from "../../test/fixtures";
import { expectError, serviceHarness } from "../../test/helpers/services.ts";
import * as timeline from "./timeline.ts";

const h = serviceHarness();

const list = (input: Record<string, unknown>) =>
	h.as(navid)((ctx, tx) => timeline.list(ctx, tx, TimelineListInputSchema.parse(input)));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

// A root with its six statuses and ticket CDE-1 in Todo.
const seed = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
	return { rootId, id };
};

describe("timeline.list", () => {
	test("timeline merges comments and activity newest first", async () => {
		const { rootId, id } = await seed();
		for (const minutes of [30, 20, 10]) await seedComment(h.db, id, `at ${minutes}`, navid, minutesAgo(minutes));
		for (const minutes of [25, 15, 5, 3, 1]) {
			await seedActivity(h.db, {
				rootId,
				projectId: rootId,
				ticketId: id,
				field: "title",
				createdAt: minutesAgo(minutes),
			});
		}
		const { result: page } = await list({ ticket: "CDE-1" });
		expect(page.items).toHaveLength(8);
		expect(page.items.map((item) => item.kind)).toEqual([
			"activity",
			"activity",
			"activity",
			"comment",
			"activity",
			"comment",
			"activity",
			"comment",
		]);
		const times = page.items.map((item) => Date.parse(item.createdAt));
		expect(times).toEqual([...times].sort((a, b) => b - a));
		expect(page.nextCursor).toBeNull();
	});

	test("timeline pages 100 items at a time through the cursor", async () => {
		const { rootId, id } = await seed();
		for (let i = 0; i < 150; i += 1) {
			await seedActivity(h.db, {
				rootId,
				projectId: rootId,
				ticketId: id,
				field: "title",
				createdAt: minutesAgo(150 - i),
			});
		}
		const { result: first } = await list({ ticket: "CDE-1" });
		expect(first.items).toHaveLength(100);
		expect(typeof first.nextCursor).toBe("string");
		const { result: second } = await list({ ticket: "CDE-1", before: first.nextCursor });
		expect(second.items).toHaveLength(50);
		expect(second.nextCursor).toBeNull();
		const ids = [...first.items, ...second.items].map((item) => `${item.kind}:${item.id}`);
		expect(new Set(ids).size).toBe(150);
	});

	test("timeline with an unknown ticket throws NOT_FOUND", async () => {
		await seed();
		const data = await expectError(list({ ticket: "CDE-999" }), "NOT_FOUND");
		expect(data).toEqual({ kind: "ticket", ref: "CDE-999" });
	});
});
