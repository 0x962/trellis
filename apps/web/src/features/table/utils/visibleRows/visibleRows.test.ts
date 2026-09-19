import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import type { TableGroup, TableItem } from "../flattenGroups";
import { flattenGroups } from "../flattenGroups";
import { visibleRows } from "./visibleRows";

const ticket = (id: string) => ({ id }) as TicketSummary;

const group = (key: string, expanded: boolean, rows: TicketSummary[]) =>
	({ key, label: key, expanded, count: rows.length, rows }) as TableGroup;

describe("visibleRows", () => {
	test("skips the rows of a collapsed group", () => {
		const groups = [
			group("todo", true, [ticket("a"), ticket("b")]),
			group("done", false, [ticket("c")]),
			group("later", true, [ticket("d")]),
		];

		const rows = visibleRows(flattenGroups(groups));

		expect(rows.map((row) => row.id)).toEqual(["a", "b", "d"]);
	});

	test("keeps the display order and drops the header and the show-more lines", () => {
		const items: TableItem[] = flattenGroups([{ ...group("todo", true, [ticket("a")]), hasMore: true } as TableGroup]);

		expect(items.map((item) => item.kind)).toEqual(["header", "row", "more"]);
		expect(visibleRows(items).map((row) => row.id)).toEqual(["a"]);
	});

	test("a collapsed group alone leaves no row", () => {
		expect(visibleRows(flattenGroups([group("done", false, [ticket("a")])]))).toEqual([]);
	});
});
