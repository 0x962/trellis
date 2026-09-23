import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { colorOfProjectKey, projectColorsByKey } from "./projectChipColor";

const project = (key: string, color: ProjectSummary["color"]): ProjectSummary => ({
	id: key,
	key,
	slug: key.toLowerCase(),
	name: key,
	position: 0,
	openCount: 0,
	openEpicCount: 0,
	color,
	archivedAt: null,
});

test("a key gives the color of its project, and an unknown key gives none", () => {
	const projects = [project("TRL", "blue"), project("CNY", null)];

	expect(colorOfProjectKey(projects, "TRL")).toBe("blue");
	expect(colorOfProjectKey(projects, "CNY")).toBeNull();
	expect(colorOfProjectKey(projects, "NOPE")).toBeNull();
	expect(colorOfProjectKey([], "TRL")).toBeNull();
});

test("the record holds the color of every project by key", () => {
	expect(projectColorsByKey([project("TRL", "blue"), project("CNY", null)])).toEqual({ TRL: "blue", CNY: null });
	expect(projectColorsByKey([])).toEqual({});
});
