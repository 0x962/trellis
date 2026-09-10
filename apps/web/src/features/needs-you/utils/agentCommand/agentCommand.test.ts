import { describe, expect, test } from "bun:test";
import { agentCommand } from "./agentCommand";

describe("agentCommand", () => {
	// ST-08. `{brief}` stands for the shell substitution that prints the
	// brief, so a template names the agent binary and nothing else.
	test("builds the command from the saved template", () => {
		expect(agentCommand('codex exec "{brief}"', "CDE-44")).toBe('codex exec "$(trellis brief CDE-44)"');
	});

	// NY-32. The names keep the order the checks arrive in.
	test("joins several failing check names with a comma in check order", () => {
		const command = agentCommand('claude "{brief}"', "CDE-44", ["test (node 22)", "lint"]);
		expect(command).toBe('claude "$(trellis brief CDE-44)" fix the failing checks: test (node 22), lint');
	});

	test("appends nothing when no check fails", () => {
		expect(agentCommand('claude "{brief}"', "CDE-38", [])).toBe('claude "$(trellis brief CDE-38)"');
	});
});
