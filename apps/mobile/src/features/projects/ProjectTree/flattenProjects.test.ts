import { describe, expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { projectId, projectSummary } from "../../../../test/projects";
import { flattenProjects } from "./flattenProjects";

const paths = (rows: readonly ProjectSummary[]) => rows.map((row) => row.path);

describe("flattenProjects", () => {
	test("flattenProjects returns roots by position with each subtree under its root", () => {
		const rows = [
			projectSummary({ path: "TRL.cli", position: 0 }),
			projectSummary({ path: "CDE.host", position: 1 }),
			projectSummary({ path: "TRL", position: 1 }),
			projectSummary({ path: "CDE.web.auth", position: 0 }),
			projectSummary({ path: "CDE", position: 0 }),
			projectSummary({ path: "CDE.web", position: 0 }),
		];

		const flat = flattenProjects(rows);

		expect(paths(flat)).toEqual(["CDE", "CDE.web", "CDE.web.auth", "CDE.host", "TRL", "TRL.cli"]);
		// The depth of a row is the number of ancestors above it, which is
		// the number of dots in its path.
		expect(flat.map((row) => row.depth)).toEqual([0, 1, 2, 1, 0, 1]);
	});

	test("flattenProjects breaks a position tie by id, so the order is stable", () => {
		const root = projectSummary({ path: "CDE", position: 0 });
		const later = projectSummary({ path: "CDE.host", position: 0, id: projectId("ZZZZZZ") });
		const earlier = projectSummary({ path: "CDE.web", position: 0, id: projectId("AAAAAA") });

		expect(paths(flattenProjects([root, later, earlier]))).toEqual(["CDE", "CDE.web", "CDE.host"]);
		expect(paths(flattenProjects([earlier, root, later]))).toEqual(["CDE", "CDE.web", "CDE.host"]);
	});
});
