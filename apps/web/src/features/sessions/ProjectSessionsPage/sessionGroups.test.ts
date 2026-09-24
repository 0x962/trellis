import { expect, test } from "bun:test";
import { nextSessionRow, sessionGroups, sessionRowRange } from "./sessionGroups";

const run = (id: string, fields: Partial<Parameters<typeof sessionGroups>[0][number]> = {}) => ({
	id,
	name: id,
	kind: "agent" as const,
	ticketId: "ticket",
	ticketIdentifier: "OP-6",
	ticketTitle: "Restore the database",
	assigned: true,
	ticketStatusCategory: "started" as const,
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
	expect(sessionRowRange([10, 11, 12], [100, 4])).toEqual([4, 10, 11, 12, 100]);
	expect(sessionRowRange([10, 11], [undefined, undefined])).toEqual([10, 11]);
	expect(sessionRowRange([10, 11], [11, undefined])).toEqual([10, 11]);
});

test("the Tab key takes over only for a row outside the tree", () => {
	const drawn = [20, 21, 22];
	expect(nextSessionRow({ focused: 22, total: 133, back: false, drawn })).toBe(23);
	expect(nextSessionRow({ focused: 21, total: 133, back: false, drawn })).toBeNull();
	expect(nextSessionRow({ focused: 20, total: 133, back: true, drawn })).toBe(19);
	expect(nextSessionRow({ focused: 132, total: 133, back: false, drawn: [132] })).toBeNull();
	expect(nextSessionRow({ focused: 0, total: 133, back: true, drawn: [0] })).toBeNull();
});
