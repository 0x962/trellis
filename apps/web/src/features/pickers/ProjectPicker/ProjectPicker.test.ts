import { describe, expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { projectsOfRoot } from "./ProjectPicker";

const summary = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
	id: "01M2P6WM9EKYD8XWF452TTZZG8",
	key: "CDE",
	path: "CDE",
	parentId: null,
	rootId: "01M2P6WM9EKYD8XWF452TTZZG7",
	slug: "cde",
	name: "Code",
	depth: 0,
	position: 0,
	openCount: 0,
	archivedAt: null,
	...overrides,
});

describe("projectsOfRoot", () => {
	test("it keeps the projects of the ticket root and drops the other roots", () => {
		const projects = [
			summary({ id: "a", path: "CDE", rootId: "root-cde" }),
			summary({ id: "b", path: "CDE.web", rootId: "root-cde", parentId: "a" }),
			summary({ id: "c", path: "OPS", rootId: "root-ops" }),
		];
		expect(projectsOfRoot(projects, "root-cde").map((project) => project.path)).toEqual(["CDE", "CDE.web"]);
	});
});
