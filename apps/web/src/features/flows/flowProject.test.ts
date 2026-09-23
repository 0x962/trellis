import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import {
	everyProjectValue,
	flowProjectItems,
	projectRefOfSelectValue,
	selectValueOfProjectKey,
} from "./flowProject.ts";

// An archived project carries a date in `archivedAt`.
const project = (key: string, archivedAt: string | null = null): ProjectSummary =>
	({ id: key, key, archivedAt }) as ProjectSummary;

test("the list holds every project first, then one item per active project", () => {
	const projects = [project("TRL"), project("OP"), project("OLD", "2026-09-01T00:00:00.000Z")];

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
