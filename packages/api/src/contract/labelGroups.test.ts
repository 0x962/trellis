import { expect, test } from "bun:test";
import { accepts } from "../../test/standardSchema.ts";
import { labelGroups } from "./labelGroups.ts";

test("label group and label create inputs require bounded names", async () => {
	const createGroup = labelGroups.create["~orpc"].inputSchema;
	expect(await accepts(createGroup, { project: "CDE", name: "Type" })).toBe(true);
	expect(await accepts(createGroup, { project: "CDE", name: "" })).toBe(false);
	expect(await accepts(createGroup, { project: "CDE", name: "x".repeat(81) })).toBe(false);

	const createLabel = labelGroups.createLabel["~orpc"].inputSchema;
	expect(await accepts(createLabel, { project: "CDE", group: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "Bug" })).toBe(true);
	expect(
		await accepts(createLabel, {
			project: "CDE",
			group: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			name: "Bug",
			color: "blue",
		}),
	).toBe(false);
});
