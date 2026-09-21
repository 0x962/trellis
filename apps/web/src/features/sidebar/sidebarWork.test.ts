import { expect, test } from "bun:test";
import type { AgentRun, ProjectSummary, SessionDetail } from "@trellis/api";
import { sidebarWorkCounts } from "./sidebarWork";

const project = (id: string, parentId: string | null = null): ProjectSummary =>
	({
		id,
		parentId,
		rootId: parentId ?? id,
		key: "TRL",
		slug: id,
		path: id,
		name: id,
		depth: parentId === null ? 0 : 1,
		position: 0,
		openCount: 0,
		openEpicCount: 0,
		archivedAt: null,
	}) as ProjectSummary;

const run = (projectId: string | null, ticketEpicProjectId: string | null = null): AgentRun =>
	({
		kind: "agent",
		projectId,
		ticketEpicProjectId,
		processStatus: "running",
		observation: { controllable: true, activity: { state: "working" }, outcome: null },
	}) as AgentRun;

const session = (projectId: string | null): SessionDetail =>
	({
		projectId,
		run: {
			state: "running",
			terminalId: "terminal",
			processStatus: "running",
			observation: { controllable: true, activity: { state: "working" }, outcome: null },
		},
	}) as SessionDetail;

test("counts working agents on a project and its ancestors", () => {
	const counts = sidebarWorkCounts([project("root"), project("child", "root")], [run("child")], []);

	expect(counts.projectRows.get("root")).toBe(1);
	expect(counts.projectRows.get("child")).toBe(1);
	expect(counts.projectSection).toBe(1);
});

test("counts epic work on the project that owns the epic", () => {
	const counts = sidebarWorkCounts([project("root"), project("child", "root")], [run("child", "root")], []);

	expect(counts.epicRows.get("root")).toBe(1);
	expect(counts.epicRows.get("child")).toBeUndefined();
});

test("splits independent sessions from project sessions", () => {
	const counts = sidebarWorkCounts([project("root")], [], [session(null), session("root")]);

	expect(counts.sessionSection).toBe(1);
	expect(counts.projectSection).toBe(1);
	expect(counts.projectSessionRows.get("root")).toBe(1);
});
