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
});
