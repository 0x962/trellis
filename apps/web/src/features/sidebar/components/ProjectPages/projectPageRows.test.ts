import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { projectPageRows } from "./projectPageRows";

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

test("Epics and Diffs stand under the project, and More holds Tickets and Sessions", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 0);

	expect(labels(top)).toEqual(["Epics", "Diffs"]);
	expect(labels(more)).toEqual(["Tickets", "Sessions"]);
});

test("only the Epics row prints a count", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 0);

	expect(top.map((row) => row.trailing)).toEqual(["3", null]);
	expect(more.map((row) => row.trailing)).toEqual([null, null]);
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

test("the settings page and its notes section leave every row off", () => {
	expect(activeLabel("/p/TRL/settings")).toBe(null);
	expect(activeLabel("/p/TRL/notes")).toBe(null);
});

test("a page of another project leaves every row off", () => {
	expect(activeLabel("/p/CDE/diffs")).toBe(null);
	expect(activeLabel("/sessions/project/CDE")).toBe(null);
});

test("the Sessions row carries the count of the active agents, and no other row does", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 2);

	expect(top.map((row) => row.activeAgentCount)).toEqual([0, 0]);
	expect(more.map((row) => row.activeAgentCount)).toEqual([0, 2]);
});

test("a project with no active agent counts none", () => {
	const { more } = projectPageRows(project, "/p/TRL", 0);

	expect(more.map((row) => row.activeAgentCount)).toEqual([0, 0]);
});
