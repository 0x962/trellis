import { describe, expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { projectId2, ticket } from "../../../fixtures.ts";

const parent = () => ticket({ project: { id: projectId2, key: "CDE", path: "CDE.web" } });

describe("sub", () => {
	// CLI-104
	test("sub creates under the parent in the parent's project", async () => {
		const routes = { "tickets.get": parent(), "tickets.create": ticket({ identifier: "CDE-43", number: 43 }) };
		const result = await runCli(["sub", "CDE-42", "-t", "Write tests", "--priority", "high"], routes);
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["tickets.get", "tickets.create"]);
		expect(result.calls[0]!.input).toEqual({ ticket: "CDE-42" });
		expect(result.calls[1]!.input).toEqual({
			project: "CDE.web",
			parent: "CDE-42",
			title: "Write tests",
			priority: "high",
		});

		const overridden = await runCli(["sub", "CDE-42", "-t", "Write tests", "-p", "CDE.app"], routes);
		expect(overridden.code).toBe(0);
		const create = overridden.calls.find((call) => call.path === "tickets.create")!;
		expect(create.input).toEqual({ project: "CDE.app", parent: "CDE-42", title: "Write tests" });
	});
});
