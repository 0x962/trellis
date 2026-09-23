import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { hiddenAgentCount, projectPageRows } from "./projectPageRows";

const project = {
	id: "01M24SPHTX36AJ3VKTNZ263E7V",
	key: "TRL",
	slug: "trellis",
	name: "Trellis",
	position: 0,
	openCount: 12,
	openEpicCount: 3,
	color: null,
	archivedAt: null,
} satisfies ProjectSummary;

const labels = (rows: { label: string }[]) => rows.map((row) => row.label);

const activeLabel = (pathname: string) => {
	const { top, more } = projectPageRows(project, pathname, 0);
	return [...top, ...more].find((row) => row.active)?.label ?? null;
};

test("Epics and Sessions stand under the project, and More holds Tickets, Diffs, Settings and Notes", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 0);

	expect(labels(top)).toEqual(["Epics", "Sessions"]);
	expect(labels(more)).toEqual(["Tickets", "Diffs", "Settings", "Notes"]);
});

test("only the Epics row prints a count", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 0);

	expect(top.map((row) => row.trailing)).toEqual(["3", null]);
	expect(more.map((row) => row.trailing)).toEqual([null, null, null, null]);
});

test("a project with no open epic prints no count", () => {
	const { top } = projectPageRows({ ...project, openEpicCount: 0 }, "/p/TRL", 0);

	expect(top[0]?.trailing).toBe(null);
});

test("each page of the project makes its own row active", () => {
	expect(activeLabel("/p/TRL")).toBe("Tickets");
	expect(activeLabel("/p/TRL/epics")).toBe("Epics");
	expect(activeLabel("/p/TRL/epics/routine-runtime")).toBe("Epics");
	expect(activeLabel("/p/TRL/diffs")).toBe("Diffs");
	expect(activeLabel("/sessions/project/TRL")).toBe("Sessions");
});

test("the Settings row and the Notes row open a sheet, and neither is ever active", () => {
	const { more } = projectPageRows(project, "/p/TRL", 0);
	const sheetRows = more.filter((row) => row.section !== null);

	expect(sheetRows.map((row) => [row.label, row.suffix, row.section, row.active])).toEqual([
		["Settings", "/settings", "", false],
		["Notes", "/notes", "notes", false],
	]);
});

test("every row that opens a page names no section", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 0);
	const pageRows = [...top, ...more].filter((row) => row.label !== "Settings" && row.label !== "Notes");

	expect(pageRows.every((row) => row.section === null)).toBe(true);
});

test("a page of another project leaves every row off", () => {
	expect(activeLabel("/p/CDE/diffs")).toBe(null);
	expect(activeLabel("/sessions/project/CDE")).toBe(null);
});

test("the Sessions row carries the count of the active agents, and no other row does", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 2);

	expect(top.map((row) => row.activeAgentCount)).toEqual([0, 2]);
	expect(more.map((row) => row.activeAgentCount)).toEqual([0, 0, 0, 0]);
});

test("a project with no active agent counts none", () => {
	const { top } = projectPageRows(project, "/p/TRL", 0);

	expect(top.map((row) => row.activeAgentCount)).toEqual([0, 0]);
});

test("the shut More row counts the agents of the rows it hides", () => {
	const { more } = projectPageRows(project, "/p/TRL", 2);

	expect(hiddenAgentCount(more)).toBe(0);
	expect(hiddenAgentCount([...more, { ...more[0]!, label: "Runs", activeAgentCount: 3 }])).toBe(3);
});
