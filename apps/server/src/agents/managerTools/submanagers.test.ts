import { expect, test } from "bun:test";
import { managerTools } from "./managerTools.ts";

test("the manager has delegation tools with bounded worker budgets", async () => {
	const calls: unknown[] = [];
	const tools = managerTools(async (operation, input) => {
		calls.push({ operation, input });
		return [];
	});
	expect(
		tools
			.list()
			.filter((tool) => tool.name.startsWith("trellis_submanagers_"))
			.map((tool) => tool.name),
	).toEqual([
		"trellis_submanagers_list",
		"trellis_submanagers_start",
		"trellis_submanagers_resize",
		"trellis_submanagers_retire",
	]);
	await tools.call("trellis_submanagers_list", {});
	expect(calls).toEqual([{ operation: "submanagers.list", input: {} }]);
	for (const capacity of [0, 65, 1.5])
		await expect(
			tools.call("trellis_submanagers_start", {
				project: "PROJECT/child",
				brief: "Finish this scope.",
				requestId: "request",
				capacity,
			}),
		).rejects.toThrow();
	expect(calls).toHaveLength(1);
});
