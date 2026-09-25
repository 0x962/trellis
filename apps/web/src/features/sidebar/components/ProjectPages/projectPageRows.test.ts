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
	openPageCommentCount: 2,
	color: null,
	archivedAt: null,
} satisfies ProjectSummary;

const labels = (rows: { label: string }[]) => rows.map((row) => row.label);

const activeLabels = (pathname: string) => {
	const { top, more } = projectPageRows(project, pathname, 0);
	return [...top, ...more].filter((row) => row.active).map((row) => row.label);
};

test("Epics and Sessions stand under the project, and More holds Tickets and Diffs", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 0);

	expect(labels(top)).toEqual(["Epics", "Sessions"]);
	expect(labels(more)).toEqual(["Tickets", "Diffs"]);
});

test("Epics prints its count", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 0);

	expect(top.map((row) => row.trailing)).toEqual(["3", null]);
	expect(more.map((row) => row.trailing)).toEqual([null, null]);
});

test("a project with no open epic prints no count", () => {
	const { top } = projectPageRows({ ...project, openEpicCount: 0, openPageCommentCount: 0 }, "/p/TRL", 0);

	expect(top[0]?.trailing).toBe(null);
});

test("each page of the project makes its own row active", () => {
	expect(activeLabels("/p/TRL")).toEqual(["Tickets"]);
	expect(activeLabels("/p/TRL/table")).toEqual(["Tickets"]);
	expect(activeLabels("/p/TRL/settings")).toEqual(["Tickets"]);
	expect(activeLabels("/p/TRL/epics")).toEqual(["Epics"]);
	expect(activeLabels("/p/TRL/epics/routine-runtime")).toEqual(["Epics"]);
	expect(activeLabels("/p/TRL/pages")).toEqual([]);
	expect(activeLabels("/p/TRL/pages/release-report")).toEqual([]);
	expect(activeLabels("/p/TRL/pages/diffs")).toEqual([]);
	expect(activeLabels("/p/TRL/diffs")).toEqual(["Diffs"]);
	expect(activeLabels("/sessions/project/TRL")).toEqual(["Sessions"]);
});

test("a page of another project leaves every row off", () => {
	expect(activeLabels("/p/CDE/diffs")).toEqual([]);
	expect(activeLabels("/sessions/project/CDE")).toEqual([]);
});

test("the Sessions row carries the count of the active agents, and no other row does", () => {
	const { top, more } = projectPageRows(project, "/p/TRL", 2);

	expect(top.map((row) => row.activeAgentCount)).toEqual([0, 2]);
	expect(more.map((row) => row.activeAgentCount)).toEqual([0, 0]);
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
