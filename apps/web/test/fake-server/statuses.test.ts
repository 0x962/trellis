import { describe, expect, test } from "bun:test";
import { StatusListOutputSchema } from "@trellis/api";
import { createFakeServer } from "./index";

describe("fake server statuses", () => {
	// WS-111. A sub-project reads its nearest ancestor's set, and the
	// output names that ancestor.
	test("statuses.list returns the effective set and its owner", async () => {
		const server = createFakeServer();
		const cde = await server.client.projects.get({ project: "CDE" });
		const web = StatusListOutputSchema.parse(await server.client.statuses.list({ project: "CDE.web" }));
		expect(web.inheritedFrom).toBe(cde.id);
		expect(web.statuses.map((status) => status.slug)).toEqual([
			"todo",
			"in-progress",
			"agent-review",
			"human-review",
			"done",
			"canceled",
		]);
		expect(web.statuses.every((status) => status.projectId === cde.id)).toBe(true);
		const root = StatusListOutputSchema.parse(await server.client.statuses.list({ project: "CDE" }));
		expect(root.inheritedFrom).toBeNull();
		expect(root.statuses).toEqual(web.statuses);
	});
});
