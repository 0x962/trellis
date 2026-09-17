import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { workingFirst, workingGroupInsertIndex } from "./columns";
import type { BoardColumnModel } from "./types";

const ticket = (id: string) => ({ id }) as TicketSummary;

const column = (id: string, ticketIds: string[]): BoardColumnModel => ({
	id,
	name: id,
	category: "started",
	statuses: [],
	items: ticketIds.map(ticket),
	count: ticketIds.length,
	wipLimit: null,
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
	test("places a moved ticket at the start of its active or inactive group", () => {
		const items = [ticket("active-a"), ticket("active-b"), ticket("idle-a")];
		const working = new Set(["active-a", "active-b", "active-new"]);

		expect(workingGroupInsertIndex(items, "active-new", working)).toBe(0);
		expect(workingGroupInsertIndex(items, "idle-new", working)).toBe(2);
	});
});
