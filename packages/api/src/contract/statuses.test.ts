import { expect, test } from "bun:test";
import { accepts } from "../../test/standardSchema.ts";
import { statuses } from "./statuses.ts";

// `category` is immutable after creation, so `update` has no such field. A
// review status names who reviews, so `create` with `category: "review"`
// needs `reviewer`.
test("status update rejects category and a review status requires a reviewer", async () => {
	const update = statuses.update["~orpc"].inputSchema;
	expect(await accepts(update, { project: "CDE", status: "todo", category: "done" })).toBe(false);
	expect(await accepts(update, { project: "CDE", status: "todo", name: "Backlog", wipLimit: 3 })).toBe(true);

	const create = statuses.create["~orpc"].inputSchema;
	expect(await accepts(create, { project: "CDE", name: "QA", category: "review" })).toBe(false);
	expect(await accepts(create, { project: "CDE", name: "QA", category: "review", reviewer: "agent" })).toBe(true);
});
