import { expect, test } from "bun:test";
import type { TableGroup, TableItem } from "../../../utils/flattenGroups";
import { gridRowCount, hasWaveSections } from "./TableBody";

const group = {
	key: "wave-1",
	label: "Foundation",
	rows: [],
	count: 0,
	expanded: true,
} as TableGroup;

const items = [
	{ kind: "header", key: "header:wave-1", group },
	{ kind: "empty", key: "empty:wave-1", group },
	{ kind: "header", key: "header:wave-2", group: { ...group, key: "wave-2" } },
	{ kind: "empty", key: "empty:wave-2", group: { ...group, key: "wave-2" } },
] as TableItem[];

test("wave grids add every exposed wave header to aria-rowcount", () => {
	expect(gridRowCount(3, items, true)).toBe(5);
});

test("non-wave grids keep the supplied ticket row count", () => {
	expect(gridRowCount(3, items, false)).toBe(3);
});

test("an epic grouped by wave keeps section semantics without wave controls", () => {
	expect(hasWaveSections("epic", true)).toBe(true);
});

test("an epic without wave groups does not expose section rows", () => {
	expect(hasWaveSections("epic", false)).toBe(false);
});

test("a general ticket list keeps its existing group semantics", () => {
	expect(hasWaveSections("list", true)).toBe(false);
});
