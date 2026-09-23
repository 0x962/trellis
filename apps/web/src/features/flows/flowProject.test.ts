import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import {
	everyProjectValue,
	flowProjectItems,
	projectRefOfSelectValue,
	selectValueOfProjectKey,
} from "./flowProject.ts";

const project = (path: string, parentId: string | null): ProjectSummary =>
	({ id: path, path, parentId }) as ProjectSummary;

test("the list holds every project first, then one item per root project", () => {
	expect(flowProjectItems([project("TRL", null), project("TRL.web", "TRL"), project("OP", null)])).toEqual([
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
