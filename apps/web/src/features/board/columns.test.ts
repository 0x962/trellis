import { describe, expect, test } from "bun:test";
import type { Project, TicketSummary } from "@trellis/api";
import { categoryColumns, moveInBoard, projectColumns, workingFirst, workingGroupInsertIndex } from "./columns";
import type { BoardColumnModel } from "./types";

const ticket = (id: string, createdAt = "2026-09-30T00:00:00Z") =>
	({ id, createdAt, project: { id: "project" } }) as TicketSummary;

const column = (id: string, ticketIds: string[]): BoardColumnModel => ({
	id,
	name: id,
	category: "started",
	statuses: [],
	items: ticketIds.map((id) => ticket(id)),
	count: ticketIds.length,
});

const ids = (value: BoardColumnModel) => value.items.map((item) => item.id);

describe("workingFirst", () => {
	test("keeps source order inside the active and inactive groups", () => {
		const source = [column("one", ["a", "b", "c", "d"]), column("two", ["e", "f", "g"])];

		const result = workingFirst(source, new Set(["b", "d", "f"]));

		expect(ids(result[0]!)).toEqual(["b", "d", "a", "c"]);
		expect(ids(result[1]!)).toEqual(["f", "e", "g"]);
		expect(ids(source[0]!)).toEqual(["a", "b", "c", "d"]);
	});

	test("restores source order after work stops", () => {
		const source = [column("one", ["a", "b", "c"])];

		expect(ids(workingFirst(source, new Set(["c"]))[0]!)).toEqual(["c", "a", "b"]);
		expect(ids(workingFirst(source, new Set())[0]!)).toEqual(["a", "b", "c"]);
	});
});

describe("workingGroupInsertIndex", () => {
	test("places a moved ticket by creation time inside its active or inactive group", () => {
		const items = [
			ticket("active-a", "2026-09-30T02:00:00Z"),
			ticket("active-b"),
			ticket("idle-a", "2026-09-30T02:00:00Z"),
		];
		const working = new Set(["active-a", "active-b", "active-new"]);

		expect(workingGroupInsertIndex(items, ticket("active-new", "2026-09-30T01:00:00Z"), working)).toBe(1);
		expect(workingGroupInsertIndex(items, ticket("idle-new", "2026-09-30T01:00:00Z"), working)).toBe(3);
		expect(workingGroupInsertIndex(items, items[0]!, working)).toBe(0);
	});
});

test("a status move and category merge keep creation order", () => {
	const status = { id: "target", category: "started", name: "Started", slug: "started", color: "fg-muted" } as const;
	const older = { ...ticket("older", "2026-09-29T00:00:00Z"), status };
	const newer = { ...ticket("newer"), status };
	const moved = ticket("middle", "2026-09-29T12:00:00Z");
	const data = {
		columns: [
			{ statusId: "source", count: 1, items: [moved] },
			{ statusId: status.id, count: 2, items: [newer, older] },
		],
	};
	const result = moveInBoard(data, moved, status);
	expect(result.columns[0]).toMatchObject({ count: 0, items: [] });
	expect(result.columns[1]!.items.map((item) => item.id)).toEqual(["newer", "middle", "older"]);
	expect(result.columns[1]!.count).toBe(3);
	const merged = categoryColumns({
		columns: [
			{ statusId: "other", count: 1, items: [older] },
			{ statusId: status.id, count: 1, items: [newer] },
		],
	});
	expect(merged.find((item) => item.category === "started")!.items.map((item) => item.id)).toEqual(["newer", "older"]);
	const updatedElsewhere = {
		columns: [{ statusId: "source", count: 1, items: [{ ...moved, status }] }, data.columns[1]!],
	};
	const project = { statuses: [{ ...status, position: 0 }] } as Project;
	expect(projectColumns(updatedElsewhere, project)[0]!.items.map((item) => item.id)).toEqual([
		"newer",
		"middle",
		"older",
	]);
});
