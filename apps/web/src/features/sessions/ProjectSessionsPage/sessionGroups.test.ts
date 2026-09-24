import { expect, test } from "bun:test";
import { keptSessionRows, nextSessionRow, selectedSession, sessionGroups, sessionRowRange } from "./sessionGroups";

const run = (id: string, fields: Partial<Parameters<typeof sessionGroups>[0][number]> = {}) => ({
	id,
	name: id,
	kind: "agent" as const,
	ticketId: "ticket",
	ticketIdentifier: "OP-6",
	ticketTitle: "Restore the database",
	assigned: true,
	ticketStatusCategory: "started" as const,
	pinnedAt: null,
	createdAt: "2026-09-17T12:00:00.000Z",
	...fields,
});

test("manual sessions stay separate from ticket agents", () => {
	const runs = [run("ticket"), run("manual", { kind: "session", ticketId: null })];
	const groups = sessionGroups(runs, { search: "", history: false });
	expect(groups.sessions.map((item) => item.id)).toEqual(["manual"]);
	expect(groups.ticketed.map((item) => item.id)).toEqual(["ticket"]);
});

test("history hides old assignments without hiding a selected deep link", () => {
	const runs = [run("current"), run("old", { assigned: false }), run("done", { ticketStatusCategory: "done" })];
	const groups = sessionGroups(runs, { search: "", history: false, selectedId: "old" });
	expect(groups.ticketed.map((item) => item.id)).toEqual(["current", "old"]);
	expect(groups.historyCount).toBe(2);
	expect(sessionGroups(runs, { search: "", history: true }).ticketed).toHaveLength(3);
});

test("a pinned old session stays visible and leads its existing group", () => {
	const runs = [
		run("current", { createdAt: "2026-09-24T12:00:00.000Z" }),
		run("pinned", { assigned: false, pinnedAt: "2026-09-24T11:00:00.000Z" }),
		run("old", { assigned: false }),
	];
	const groups = sessionGroups(runs, { search: "", history: false });
	expect(groups.ticketed.map((item) => item.id)).toEqual(["pinned", "current"]);
	expect(groups.historyCount).toBe(1);
});

test("a refresh keeps the selected session when a pin changes the row order", () => {
	const current = run("current");
	const pinned = run("pinned", { pinnedAt: "2026-09-24T11:00:00.000Z" });
	expect(selectedSession([current, pinned], [pinned, current], "", current.id)?.id).toBe("current");
});

test("search finds historical ticket titles and identifiers without a history toggle", () => {
	const runs = [
		run("old", { assigned: false }),
		run("current", { ticketIdentifier: "OP-21", ticketTitle: "Improve UI" }),
	];
	expect(sessionGroups(runs, { search: " DATABASE ", history: false }).ticketed.map((item) => item.id)).toEqual([
		"old",
	]);
	expect(sessionGroups(runs, { search: "op-6", history: false }).ticketed.map((item) => item.id)).toEqual(["old"]);
	expect(sessionGroups(runs, { search: "missing", history: true }).ticketed).toEqual([]);
});

test("the drawn rows hold the selected row and the focused row", () => {
	const runs = [run("a"), run("b"), run("c")];
	expect(keptSessionRows(runs, ["c", "a"])).toEqual([2, 0]);
	expect(sessionRowRange([10, 11, 12], [100, 4])).toEqual([4, 10, 11, 12, 100]);
	expect(sessionRowRange([10, 11], [-1, -1])).toEqual([10, 11]);
	expect(sessionRowRange([10, 11], [11, -1])).toEqual([10, 11]);
});

test("a poll that drops or moves the focused run cannot name a row that is gone", () => {
	const runs = [run("a"), run("b"), run("c")];
	// The run of the focus leaves the list, and the selected run moves up.
	const shorter = [run("c"), run("a")];
	expect(keptSessionRows(runs, ["a", "b"])).toEqual([0, 1]);
	expect(keptSessionRows(shorter, ["a", "b"])).toEqual([1, -1]);
	expect(sessionRowRange([0, 1], keptSessionRows(shorter, ["a", "b"]))).toEqual([0, 1]);
	expect(keptSessionRows(shorter, [undefined, undefined])).toEqual([-1, -1]);
	// Every place the list keeps comes from the list itself, so no place
	// stands outside the rows the virtualizer counts.
	for (const index of sessionRowRange([0], keptSessionRows(shorter, ["a", "c"]))) {
		expect(shorter[index]).toBeDefined();
	}
});

test("the Tab key reaches the group controls at both ends of the list", () => {
	const drawn = [20, 21, 22];
	expect(nextSessionRow({ focused: 22, total: 133, back: false, drawn })).toBe(23);
	expect(nextSessionRow({ focused: 21, total: 133, back: false, drawn })).toBeNull();
	expect(nextSessionRow({ focused: 20, total: 133, back: true, drawn })).toBe(19);
	// The last row of a group: the focus leaves the list for the header of
	// the next group.
	expect(nextSessionRow({ focused: 132, total: 133, back: false, drawn: [132] })).toBeNull();
	// The first row of a group: the focus goes back to the control of its
	// own header.
	expect(nextSessionRow({ focused: 0, total: 133, back: true, drawn: [0] })).toBeNull();
	// A run that left the list between the key and the read.
	expect(nextSessionRow({ focused: -1, total: 133, back: false, drawn })).toBeNull();
});
