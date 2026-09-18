import { describe, expect, test } from "bun:test";
import type { TicketLabel, TicketSummary } from "@trellis/api";
import type { PaletteRow, RowDeps, Submenu } from "../../rows";
import { selectionRows } from "./ticketRows";

const row = (identifier: string, labels: TicketLabel[] = [], path = "op"): TicketSummary =>
	({
		id: identifier.toLowerCase(),
		identifier,
		title: identifier,
		project: { id: "p1", key: "OP", path },
		labels,
		version: 1,
	}) as unknown as TicketSummary;

// The submenu the last row of the build opened, and the writes it started.
type Recorder = {
	opened: Submenu[];
	removed: TicketSummary[][];
	selectedAll: number;
	cleared: number;
};

const build = (selection: TicketSummary[]) => {
	const record: Recorder = { opened: [], removed: [], selectedAll: 0, cleared: 0 };
	const deps = {
		action: {},
		ticket: undefined,
		identifier: null,
		selection,
		bulk: {
			update: async () => {},
			remove: async (rows: readonly TicketSummary[]) => {
				record.removed.push([...rows]);
			},
			confirmDialog: null,
		},
		selectionOwner: {
			selectAll: () => {
				record.selectedAll += 1;
			},
			clear: () => {
				record.cleared += 1;
			},
		},
		projects: [],
		pathname: "/op",
		search: {},
		routeProject: "op",
		openSubmenu: (submenu: Submenu) => record.opened.push(submenu),
		close: () => {},
	} as unknown as RowDeps;
	return { rows: selectionRows(deps), record };
};

const rowOf = (rows: PaletteRow[], value: string) => rows.find((entry) => entry.value === value)!;

describe("selectionRows", () => {
	test("gives no row for an empty selection", () => {
		expect(build([]).rows).toEqual([]);
	});

	test("gives every Selection row in spec order for one ticket", () => {
		const { rows } = build([row("OP-1")]);
		expect(rows.map((entry) => entry.value)).toEqual([
			"selection.status",
			"selection.priority",
			"selection.labels",
			"selection.project",
			"selection.parent",
			"selection.epic",
			"selection.copyIds",
			"selection.copyLinks",
			"selection.delete",
			"selection.selectAll",
			"selection.clear",
		]);
	});

	test("sends every selected identifier to the submenu it opens", () => {
		const { rows, record } = build([row("OP-1"), row("OP-2"), row("OP-3")]);
		rowOf(rows, "selection.status").run();
		rowOf(rows, "selection.epic").run();
		expect(record.opened[0]).toEqual({ kind: "status", tickets: ["OP-1", "OP-2", "OP-3"], project: "op", bulk: true });
		expect(record.opened[1]).toEqual({ kind: "epic", tickets: ["OP-1", "OP-2", "OP-3"], project: "op", bulk: true });
	});

	test("marks the submenu of a selection of one ticket as a bulk write", () => {
		const { rows, record } = build([row("OP-1")]);
		rowOf(rows, "selection.priority").run();
		expect(record.opened[0]).toEqual({ kind: "priority", tickets: ["OP-1"], bulk: true });
	});

	test("offers the epics of the root project for a row under a sub-project", () => {
		const { rows, record } = build([row("OP-9", [], "op.web")]);
		rowOf(rows, "selection.epic").run();
		expect(record.opened[0]).toEqual({ kind: "epic", tickets: ["OP-9"], project: "op", bulk: true });
	});

	test("deletes every selected row through the bulk path", () => {
		const selection = [row("OP-1"), row("OP-2")];
		const { rows, record } = build(selection);
		rowOf(rows, "selection.delete").run();
		expect(record.removed).toEqual([selection]);
	});

	test("calls the selection owner for Select all and Clear selection", () => {
		const { rows, record } = build([row("OP-1")]);
		rowOf(rows, "selection.selectAll").run();
		rowOf(rows, "selection.clear").run();
		expect(record.selectedAll).toBe(1);
		expect(record.cleared).toBe(1);
	});

	test("checks a label every ticket holds and marks a label some tickets hold", () => {
		const bug: TicketLabel = { id: "l1", name: "Bug", color: "red", group: null };
		const web: TicketLabel = { id: "l2", name: "web", color: "blue", group: null };
		const { rows, record } = build([row("OP-1", [bug, web]), row("OP-2", [bug])]);
		rowOf(rows, "selection.labels").run();
		const opened = record.opened[0] as Extract<Submenu, { kind: "labels" }>;
		expect(opened.checked).toEqual(["l1"]);
		expect(opened.mixed).toEqual(["l2"]);
	});
});
