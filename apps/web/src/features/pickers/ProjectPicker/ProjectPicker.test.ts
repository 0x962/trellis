import { describe, expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { selectableProjects } from "./ProjectPicker";

const project = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
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

describe("selectableProjects", () => {
	test("it keeps the projects of the ticket root and drops the other roots", () => {
		const projects = [
			project({ id: "a", path: "CDE", rootId: "root-cde" }),
			project({ id: "b", path: "CDE.web", rootId: "root-cde", parentId: "a" }),
			project({ id: "c", path: "OPS", rootId: "root-ops" }),
		];
		expect(selectableProjects(projects, ["root-cde"]).map((entry) => entry.path)).toEqual(["CDE", "CDE.web"]);
	});

	test("it drops an archived project and its descendants", () => {
		const projects = [
			project({ id: "a", path: "CDE", rootId: "root-cde" }),
			project({
				id: "b",
				path: "CDE.web",
				rootId: "root-cde",
				parentId: "a",
				archivedAt: "2026-09-17T00:00:00.000Z",
			}),
			project({ id: "c", path: "CDE.web.auth", rootId: "root-cde", parentId: "b" }),
			project({ id: "d", path: "CDE.api", rootId: "root-cde", parentId: "a" }),
		];
		expect(selectableProjects(projects, ["root-cde"]).map((entry) => entry.path)).toEqual(["CDE", "CDE.api"]);
	});

	test("it offers no project when selected tickets span roots", () => {
		const projects = [
			project({ id: "a", path: "CDE", rootId: "root-cde" }),
			project({ id: "b", path: "OPS", rootId: "root-ops" }),
		];
		expect(selectableProjects(projects, ["root-cde", "root-ops"])).toEqual([]);
	});

	test("it keeps active projects from every root when no ticket limits the picker", () => {
		const projects = [
			project({ id: "a", path: "CDE", rootId: "root-cde" }),
			project({ id: "b", path: "OPS", rootId: "root-ops" }),
		];
		expect(selectableProjects(projects).map((entry) => entry.path)).toEqual(["CDE", "OPS"]);
	});
});
