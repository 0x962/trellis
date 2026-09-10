import { describe, expect, test } from "bun:test";
import { buildAgentCommand } from "./buildAgentCommand";

describe("features/agent/StartWithAgent/utils/buildAgentCommand", () => {
	// WT-91. Every `{brief}` becomes the identifier; nothing else moves.
	test("substitutes the brief placeholder and changes nothing else", () => {
		expect(buildAgentCommand('claude "$(trellis brief {brief})"', "CDE-42")).toBe('claude "$(trellis brief CDE-42)"');
		const twice = 'echo {brief} && codex exec "$(trellis brief {brief})"  # {brief}';
		expect(buildAgentCommand(twice, "TRL-9")).toBe('echo TRL-9 && codex exec "$(trellis brief TRL-9)"  # TRL-9');
		const untouched = 'claude "$(trellis brief)" \t\n {other} $BRIEF';
		expect(buildAgentCommand(untouched, "CDE-42")).toBe(untouched);
	});

	// The shell passes the quoted argument to the agent as one prompt. Text
	// after the closing quote becomes extra arguments that the agent never
	// reads as part of the prompt.
	test("puts the appended text inside the quotes of the brief argument", () => {
		expect(
			buildAgentCommand('claude "$(trellis brief {brief})"', "CDE-44", {
				append: "Fix the failed checks: test (node 22), lint.",
			}),
		).toBe('claude "$(trellis brief CDE-44) Fix the failed checks: test (node 22), lint."');
		expect(buildAgentCommand('codex exec "{brief}" --yolo', "CDE-44", { append: "Fix lint." })).toBe(
			'codex exec "CDE-44 Fix lint." --yolo',
		);
	});

	// A double quote, a dollar sign, a backtick, or a backslash in a check
	// name must reach the agent as text, not as shell syntax.
	test("escapes the shell characters of the appended text", () => {
		expect(buildAgentCommand('claude "{brief}"', "CDE-44", { append: 'Fix "e2e" $HOME `x` a\\b.' })).toBe(
			'claude "CDE-44 Fix \\"e2e\\" \\$HOME \\`x\\` a\\\\b."',
		);
	});

	// A template with no quoted brief argument gets the text as one new
	// quoted argument.
	test("quotes the appended text when the brief is not in quotes", () => {
		expect(buildAgentCommand("agent {brief}", "CDE-44", { append: "Fix lint." })).toBe('agent CDE-44 "Fix lint."');
	});

	test("an empty append changes nothing", () => {
		expect(buildAgentCommand('claude "{brief}"', "CDE-44", { append: "" })).toBe('claude "CDE-44"');
	});
});
