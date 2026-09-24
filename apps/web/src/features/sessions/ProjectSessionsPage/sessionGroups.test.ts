import { expect, test } from "bun:test";
import { nextSessionLimit, SESSION_REVEAL_STEP, sessionGroups, visibleSessions } from "./sessionGroups";

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

test("a group draws one step of rows and keeps the selected run", () => {
	const runs = Array.from({ length: 119 }, (_, index) => run(`run-${index}`));
	expect(visibleSessions(runs, SESSION_REVEAL_STEP).map((item) => item.id)).toEqual(
		runs.slice(0, SESSION_REVEAL_STEP).map((item) => item.id),
	);
	const withSelected = visibleSessions(runs, SESSION_REVEAL_STEP, "run-100");
	expect(withSelected).toHaveLength(SESSION_REVEAL_STEP + 1);
	expect(withSelected[SESSION_REVEAL_STEP]?.id).toBe("run-100");
	const inStep = visibleSessions(runs, SESSION_REVEAL_STEP, "run-2");
	expect(inStep).toHaveLength(SESSION_REVEAL_STEP);
});

test("the reveal reaches every run and then stops", () => {
	const total = 119;
	let limit = SESSION_REVEAL_STEP;
	const steps = [];
	for (let reveal = 0; reveal < 10; reveal++) {
		limit = nextSessionLimit(limit, total);
		steps.push(limit);
	}
	expect(steps).toEqual([60, 90, 119, 119, 119, 119, 119, 119, 119, 119]);
	expect(nextSessionLimit(total, total)).toBe(total);
	expect(nextSessionLimit(SESSION_REVEAL_STEP, 5)).toBe(5);
});
