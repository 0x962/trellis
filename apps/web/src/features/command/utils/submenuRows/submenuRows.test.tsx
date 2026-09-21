import { describe, expect, test } from "bun:test";
import type { Label, TicketSummary } from "@trellis/api";
import type { RowDeps, Submenu } from "../../rows";
import { submenuRows } from "./submenuRows";

const label = (id: string, name: string): Label =>
	({ id, projectId: "root", groupId: null, name, color: "blue" }) as unknown as Label;

const row = (identifier: string): TicketSummary =>
	({
		id: identifier.toLowerCase(),
		identifier,
		title: identifier,
		project: { id: "p1", key: "OP", path: "op" },
		labels: [],
		version: 1,
	}) as unknown as TicketSummary;

const labels = [label("l1", "Bug"), label("l2", "web"), label("l3", "Chore")];

// The label writes the rows started: the label id and the state it takes.
type Write = { label: string; on: boolean };

const build = (submenu: Submenu, selection: TicketSummary[]) => {
	const writes: Write[] = [];
	const deps = {
		action: {},
		ticket: undefined,
		identifier: null,
		selection,
		bulk: {
			update: async (_rows: readonly TicketSummary[], patch: Record<string, string[]>) => {
				const added = patch.addLabels;
				writes.push(
					added === undefined ? { label: patch.removeLabels![0]!, on: false } : { label: added[0]!, on: true },
				);
			},
			remove: async () => {},
			confirmDialog: null,
		},
		selectionOwner: { selectAll: () => {}, clear: () => {} },
		projects: [],
		pathname: "/op",
		search: {},
		routeProject: "op",
		openSubmenu: () => {},
		close: () => {},
	} as unknown as RowDeps;
	const rows = submenuRows(submenu, deps, {
		statuses: [],
		tickets: [],
		labels,
		labelGroups: [],
		epics: [],
		waves: [],
	});
	return { rows, writes };
};

const mixedSubmenu: Submenu = {
	kind: "labels",
	tickets: ["OP-1", "OP-2"],
	project: "op",
	checked: ["l1"],
	mixed: ["l2"],
	bulk: true,
};

describe("submenuRows labels over a selection", () => {
	test("checks a label every ticket holds, marks a mixed label, and leaves the rest plain", () => {
		const { rows } = build(mixedSubmenu, [row("OP-1"), row("OP-2")]);
		expect(rows.map((entry) => entry.checked)).toEqual([true, "mixed", undefined]);
	});

	test("names the pick on a checked label Remove", () => {
		const { rows } = build(mixedSubmenu, [row("OP-1"), row("OP-2")]);
		expect(rows[0]!.sub).toBe("Remove");
		expect(rows[1]!.sub).toBeUndefined();
	});

	test("removes a checked label from every selected ticket", () => {
		const { rows, writes } = build(mixedSubmenu, [row("OP-1"), row("OP-2")]);
		rows[0]!.run();
		expect(writes).toEqual([{ label: "l1", on: false }]);
	});

	test("adds a mixed label to every selected ticket", () => {
		const { rows, writes } = build(mixedSubmenu, [row("OP-1"), row("OP-2")]);
		rows[1]!.run();
		expect(writes).toEqual([{ label: "l2", on: true }]);
	});

	test("takes the bulk path for a selection of one ticket", () => {
		const oneRow: Submenu = { kind: "labels", tickets: ["OP-1"], project: "op", checked: [], mixed: [], bulk: true };
		const { rows, writes } = build(oneRow, [row("OP-1")]);
		rows[0]!.run();
		expect(writes).toEqual([{ label: "l1", on: true }]);
	});
});
