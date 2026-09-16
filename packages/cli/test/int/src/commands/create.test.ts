import { describe, expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { ticket } from "../../../fixtures.ts";

describe("create", () => {
	// CLI-81
	test("create maps every flag", async () => {
		const argv = [
			...["create", "-p", "CDE", "-t", "Dark mode", "-d", "Text"],
			...["--priority", "high", "--status", "todo", "--parent", "CDE-1"],
		];
		const result = await runCli(argv, { "tickets.create": ticket() });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "tickets.create" });
		expect(result.calls[0]!.input).toEqual({
			project: "CDE",
			title: "Dark mode",
			description: "Text",
			priority: "high",
			status: "todo",
			parent: "CDE-1",
		});

		const quiet = await runCli([...argv, "--quiet"], { "tickets.create": ticket() });
		expect(quiet.stdout).toBe("CDE-42\n");
	});

	test("create accepts the legacy force flag", async () => {
		const result = await runCli(["create", "-p", "CDE", "-t", "T", "--status", "done", "--force"], {
			"tickets.create": ticket(),
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ project: "CDE", title: "T", status: "done", force: true });
	});

	// CLI-82
	test("create -d - reads the description from stdin", async () => {
		const result = await runCli(
			["create", "-p", "CDE", "-t", "T", "-d", "-"],
			{ "tickets.create": ticket() },
			{ stdin: "# Spec\nbody" },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ project: "CDE", title: "T", description: "# Spec\nbody" });
	});
});
