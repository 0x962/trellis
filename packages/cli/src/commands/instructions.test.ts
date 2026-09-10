import { describe, expect, test } from "bun:test";
import { instructions } from "@trellis/api";
import { runCli } from "../../test/deps.ts";
import template from "../instructions.md" with { type: "text" };

describe("instructions", () => {
	// CLI-114
	test("instructions prints the block with the key substituted", async () => {
		const result = await runCli(["instructions", "--project", "CDE"]);
		expect(result.code).toBe(0);
		expect(result.calls).toEqual([]);
		expect(result.stdout).toStartWith("## Ticket workflow (trellis)");
		for (const fragment of [
			"--project CDE",
			"CDE-42",
			"move CDE-42 in-progress",
			"move CDE-42 agent-review",
			"human-review",
			"sub CDE-42",
			"comment CDE-42",
			"watch --ticket CDE-42",
			"Never move a ticket to Done; a human does that. Never delete tickets.",
		]) {
			expect(result.stdout, fragment).toContain(fragment);
		}
		const curl = result.stdout.split("\n").find((line) => line.startsWith("curl"));
		expect(curl).toBeDefined();
		expect(curl).toContain("x-trellis-actor");
		expect(curl).toContain("Content-Type");
	});

	// CLI-115: the md file carries the literal placeholder KEY, so the CLI
	// text and the api template render the same block for one key.
	test("instructions.md matches the api template", async () => {
		expect(template.replaceAll("KEY", "CDE")).toBe(instructions("CDE"));
		const result = await runCli(["instructions", "--project", "CDE"]);
		expect(result.stdout).toBe(instructions("CDE"));
	});

	// CLI-116
	test("instructions without a project uses KEY", async () => {
		const result = await runCli(["instructions"]);
		expect(result.code).toBe(0);
		expect(result.calls).toEqual([]);
		expect(result.stdout).toBe(instructions("KEY"));
	});
});
