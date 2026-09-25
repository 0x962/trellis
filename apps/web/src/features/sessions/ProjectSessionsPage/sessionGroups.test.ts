import { afterEach, expect, setSystemTime, test } from "bun:test";
import {
	isAutomaticallyArchived,
	keptSessionRows,
	nextSessionArchiveAt,
	nextSessionRow,
	selectedSession,
	sessionGroups,
	sessionRowRange,
} from "./sessionGroups";

const now = new Date("2026-09-25T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

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
	activityAt: hoursAgo(1),
	createdAt: "2026-09-17T12:00:00.000Z",
	...fields,
});

afterEach(() => setSystemTime());

test("manual sessions and ticket agents share one list", () => {
	setSystemTime(now);
	const runs = [
		run("ticket", { activityAt: hoursAgo(2) }),
		run("manual", { kind: "session", ticketId: null, activityAt: hoursAgo(1) }),
	];
	expect(sessionGroups(runs, { search: "", archived: false }).runs.map((item) => item.id)).toEqual([
		"manual",
		"ticket",
	]);
});

test("an unpinned session moves to Archived at the 48-hour boundary", () => {
	const old = run("old", { activityAt: hoursAgo(48) });
	setSystemTime(new Date(now.getTime() - 1));
	expect(isAutomaticallyArchived(old)).toBe(false);
	setSystemTime(now);
	expect(isAutomaticallyArchived(old)).toBe(true);
	setSystemTime(new Date(now.getTime() + 1));
	expect(isAutomaticallyArchived(old)).toBe(true);
});

test("the next archive time skips pinned sessions and sessions with no activity", () => {
	setSystemTime(now);
	expect(
		nextSessionArchiveAt([
			run("later", { activityAt: hoursAgo(46) }),
			run("next", { activityAt: hoursAgo(47) }),
			run("pinned", { activityAt: hoursAgo(47.5), pinnedAt: hoursAgo(1) }),
			run("unknown", { activityAt: null }),
		]),
	).toBe(now.getTime() + 3_600_000);
});

test("a pinned session stays current after 48 hours", () => {
	setSystemTime(now);
	const runs = [
		run("current", { activityAt: hoursAgo(1) }),
		run("pinned", { activityAt: hoursAgo(80), pinnedAt: hoursAgo(2) }),
		run("old", { activityAt: hoursAgo(80) }),
	];
	expect(sessionGroups(runs, { search: "", archived: false }).runs.map((item) => item.id)).toEqual([
		"pinned",
		"current",
	]);
	expect(sessionGroups(runs, { search: "", archived: true }).runs.map((item) => item.id)).toEqual(["old"]);
});

test("new activity returns an automatically archived session to the current list", () => {
	setSystemTime(now);
	const old = run("session", { activityAt: hoursAgo(49) });
	expect(sessionGroups([old], { search: "", archived: true }).runs).toHaveLength(1);
	const active = { ...old, activityAt: hoursAgo(1) };
	expect(sessionGroups([active], { search: "", archived: false }).runs).toHaveLength(1);
	expect(sessionGroups([active], { search: "", archived: true }).runs).toHaveLength(0);
});

test("the creation time cannot archive a session with no stored activity", () => {
	setSystemTime(now);
	const session = run("session", { activityAt: null, createdAt: hoursAgo(200) });
	expect(sessionGroups([session], { search: "", archived: false }).runs).toHaveLength(1);
	expect(sessionGroups([session], { search: "", archived: true }).runs).toHaveLength(0);
});

test("a refresh keeps the selected session when a pin changes the row order", () => {
	const current = run("current");
	const pinned = run("pinned", { pinnedAt: "2026-09-24T11:00:00.000Z" });
	expect(selectedSession([current, pinned], [pinned, current], "", current.id)?.id).toBe("current");
});

test("search filters only the selected archive mode", () => {
	setSystemTime(now);
	const runs = [
		run("old", { activityAt: hoursAgo(49) }),
		run("current", { ticketIdentifier: "OP-21", ticketTitle: "Improve UI" }),
	];
	expect(sessionGroups(runs, { search: " DATABASE ", archived: false }).runs).toEqual([]);
	expect(sessionGroups(runs, { search: "op-6", archived: true }).runs.map((item) => item.id)).toEqual(["old"]);
	expect(sessionGroups(runs, { search: "missing", archived: true }).runs).toEqual([]);
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

test("the Tab key reaches the list controls at both ends of the list", () => {
	const drawn = [20, 21, 22];
	expect(nextSessionRow({ focused: 22, total: 133, back: false, drawn })).toBe(23);
	expect(nextSessionRow({ focused: 21, total: 133, back: false, drawn })).toBeNull();
	expect(nextSessionRow({ focused: 20, total: 133, back: true, drawn })).toBe(19);
	// The last row lets the browser move the focus to the next control.
	expect(nextSessionRow({ focused: 132, total: 133, back: false, drawn: [132] })).toBeNull();
	// The first row lets the browser move the focus to the prior control.
	expect(nextSessionRow({ focused: 0, total: 133, back: true, drawn: [0] })).toBeNull();
	// A run that left the list between the key and the read.
	expect(nextSessionRow({ focused: -1, total: 133, back: false, drawn })).toBeNull();
});
