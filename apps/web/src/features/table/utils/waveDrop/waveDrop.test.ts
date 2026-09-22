import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import type { TableGroup, TableItem } from "../flattenGroups";
import { draggedIds, dropGroup, groupSpan } from "./waveDrop";

const ticket = (id: string) => ({ id }) as TicketSummary;
const group = (key: string, rows: TicketSummary[], epicRef: string | undefined = "OP/epic") =>
	({ key, label: key, rows, epicRef, expanded: true, count: rows.length }) as TableGroup;

const one = group("one", [ticket("a"), ticket("b")]);
const two = group("two", []);
const none = group("none", [ticket("c")]);
const items: TableItem[] = [
	{ kind: "header", key: "header:one", group: one },
	{ kind: "row", key: "a", group: one, ticket: ticket("a"), agentLine: null, disclosure: null, hasChildLines: false },
	{ kind: "row", key: "b", group: one, ticket: ticket("b"), agentLine: null, disclosure: null, hasChildLines: false },
	{ kind: "header", key: "header:two", group: two },
	{ kind: "empty", key: "empty:two", group: two },
	{ kind: "header", key: "header:none", group: none },
	{ kind: "row", key: "c", group: none, ticket: ticket("c"), agentLine: null, disclosure: null, hasChildLines: false },
];

describe("draggedIds", () => {
	test("carries the selection when the dragged row is selected", () => {
		expect(draggedIds("a", ["a", "c"])).toEqual(["a", "c"]);
	});

	test("carries the row alone when the selection does not hold it", () => {
		expect(draggedIds("b", ["a", "c"])).toEqual(["b"]);
	});
});

describe("dropGroup", () => {
	test("takes a drop into another wave and into No wave", () => {
		expect(dropGroup(items, "two", ["a"])).toBe(two);
		expect(dropGroup(items, "none", ["a"])).toBe(none);
	});

	test("takes no drop into the group that holds every dragged ticket", () => {
		expect(dropGroup(items, "one", ["a", "b"])).toBeNull();
		expect(dropGroup(items, "one", ["a", "c"])).toBe(one);
	});

	test("takes no drop outside a table of one epic", () => {
		const loose = { ...group("loose", []), epicRef: undefined };

		expect(dropGroup([{ kind: "header", key: "header:loose", group: loose }], "loose", ["a"])).toBeNull();
	});
});

describe("groupSpan", () => {
	test("spans the header, the rows and the empty line of a group", () => {
		expect(groupSpan(items, "one")).toEqual({ first: 0, last: 2 });
		expect(groupSpan(items, "two")).toEqual({ first: 3, last: 4 });
		expect(groupSpan(items, "gone")).toBeNull();
	});
});
