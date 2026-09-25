import { expect, test } from "bun:test";
import { ProjectColorSchema, type ProjectSummary } from "@trellis/api";
import { projectColors } from "@trellis/ui";
import { takenColors } from "./projectColors";

const project = (id: string, color: ProjectSummary["color"]): ProjectSummary => ({
	id,
	key: "TRL",
	slug: "trl",
	name: id,
	position: 0,
	openCount: 0,
	openEpicCount: 0,
	openPageCommentCount: 0,
	color,
	archivedAt: null,
});

// packages/ui never imports the api, so the color list stands in both. The
// two have to hold the same names in the same order.
test("the color list of the ui package matches the api enum", () => {
	expect([...projectColors]).toEqual([...ProjectColorSchema.options]);
});

test("a project does not hold its own color against itself", () => {
	const projects = [project("one", "blue"), project("two", "teal"), project("three", null)];

	expect(takenColors(projects)).toEqual(["blue", "teal"]);
	expect(takenColors(projects, "one")).toEqual(["teal"]);
});

test("an archived project holds no color slot", () => {
	const archived = { ...project("four", "pink"), archivedAt: "2026-09-23T10:00:00.000Z" };

	expect(takenColors([project("one", "blue"), archived])).toEqual(["blue"]);
});
