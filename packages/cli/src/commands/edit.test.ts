import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../test/deps.ts";
import { rpcError } from "../../test/fakeServer.ts";
import { ticket } from "../../test/fixtures.ts";

describe("edit", () => {
	// CLI-91
	test("edit maps every flag and none to null", async () => {
		const argv = [
			...["edit", "CDE-42", "--title", "T", "--description", "D", "--priority", "low", "--parent", "none"],
			...["--project", "CDE.web", "--status", "todo", "--expect-version", "3"],
		];
		const result = await runCli(argv, { "tickets.update": ticket() });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "tickets.update" });
		expect(result.calls[0]!.input).toEqual({
			ticket: "CDE-42",
			title: "T",
			description: "D",
			priority: "low",
			parent: null,
			project: "CDE.web",
			status: "todo",
			expectedVersion: 3,
		});

		const parent = await runCli(["edit", "CDE-42", "--parent", "CDE-1"], { "tickets.update": ticket() });
		expect(parent.calls[0]!.input).toEqual({ ticket: "CDE-42", parent: "CDE-1" });

		const stdin = await runCli(
			["edit", "CDE-42", "--description", "-"],
			{ "tickets.update": ticket() },
			{ stdin: "# Spec\nbody" },
		);
		expect(stdin.calls[0]!.input).toEqual({ ticket: "CDE-42", description: "# Spec\nbody" });
	});

	// CLI-92
	test("edit exits 4 on a version conflict", async () => {
		const result = await runCli(["edit", "CDE-42", "--title", "T", "--expect-version", "3"], {
			"tickets.update": rpcError("VERSION_CONFLICT", { current: ticket({ version: 7 }) }),
		});
		expect(result.code).toBe(4);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toMatch(/\b7\b/);
		expect(result.stderr).toEndWith(" (VERSION_CONFLICT)\n");
	});
});
