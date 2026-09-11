import { describe, expect, test } from "bun:test";
import { BoardOutputSchema, CountsOutputSchema } from "@trellis/api";
import { createFakeServer } from "./index";

describe("fake server tickets.board and tickets.counts", () => {
	// WS-116. One column per effective status in status order, items by
	// (updatedAt, id) descending, at most 100 per column. The counts agree.
	test("board and counts agree with each other and with the status order", async () => {
		const server = createFakeServer();
		const project = await server.client.projects.get({ project: "CDE" });
		const board = BoardOutputSchema.parse(await server.client.tickets.board({ project: "CDE" }));
		const counts = CountsOutputSchema.parse(await server.client.tickets.counts({ project: "CDE" }));
		expect(board.columns.map((column) => column.statusId)).toEqual(project.statuses.map((status) => status.id));
		const bySlug = Object.fromEntries(
			board.columns.map((column) => [project.statuses.find((status) => status.id === column.statusId)!.slug, column]),
		);
		expect(bySlug["in-progress"]!.count).toBe(4);
		expect(bySlug["agent-review"]!.count).toBe(2);
		expect(bySlug["human-review"]!.count).toBe(2);
		expect(bySlug.done!.count).toBe(19);
		expect(bySlug.canceled!.count).toBe(2);
		expect(bySlug.todo!.count).toBe(23);
		expect(counts.total).toBe(52);
		expect(counts.byStatus.reduce((sum, row) => sum + row.count, 0)).toBe(counts.total);
		for (const column of board.columns) {
			expect(counts.byStatus.find((row) => row.statusId === column.statusId)!.count).toBe(column.count);
			expect(column.items.length).toBeLessThanOrEqual(100);
			expect(column.items.length).toBe(Math.min(column.count, 100));
			const ordered = [...column.items].sort((a, b) =>
				a.updatedAt === b.updatedAt ? (a.id < b.id ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1,
			);
			expect(column.items.map((item) => item.id)).toEqual(ordered.map((item) => item.id));
			expect(column.items.every((item) => item.status.id === column.statusId)).toBe(true);
		}
		expect(bySlug["human-review"]!.items.map((item) => item.identifier).sort()).toEqual(["CDE-37", "CDE-42"]);
		const filtered = await server.client.tickets.counts({ project: "CDE", status: ["in-progress"] });
		expect(filtered.total).toBe(4);
	});
});
