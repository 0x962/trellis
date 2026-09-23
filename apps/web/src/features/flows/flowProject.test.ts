import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import {
	everyProjectValue,
	flowProjectItems,
	projectRefOfSelectValue,
	selectValueOfProjectKey,
} from "./flowProject.ts";

// A root project holds its own id in `rootId`, which is the rule the flows
// service states. An archived project carries a date in `archivedAt`.
const project = (path: string, rootId: string, archivedAt: string | null = null): ProjectSummary =>
	({ id: path, path, rootId, archivedAt }) as ProjectSummary;

test("the list holds every project first, then one item per root project", () => {
	const projects = [
		project("TRL", "TRL"),
		project("TRL.web", "TRL"),
		project("OP", "OP"),
		project("OLD", "OLD", "2026-09-01T00:00:00.000Z"),
	];

	expect(flowProjectItems(projects)).toEqual([
		{ value: everyProjectValue, label: "Every project" },
		{ value: "TRL", label: "TRL" },
		{ value: "OP", label: "OP" },
	]);
});

test("a flow with no project starts on every project", () => {
	expect(selectValueOfProjectKey(null)).toBe(everyProjectValue);
	expect(selectValueOfProjectKey("TRL")).toBe("TRL");
});

test("every project sends null, so the flow applies everywhere", () => {
	expect(projectRefOfSelectValue(everyProjectValue)).toBeNull();
	expect(projectRefOfSelectValue("TRL")).toBe("TRL");
});
