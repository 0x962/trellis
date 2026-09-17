import { expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { agentProfileOf } from "./agentProfileOf";

test("an agent profile names its provider, model, and effort", () => {
	expect(agentProfileOf(HarnessSchema.parse({ preset: "codex", model: "openai/gpt-6-astra", effort: "max" }))).toEqual({
		provider: "openai",
		model: "GPT-6 Astra",
		effort: "Max",
	});
});

test("an agent profile shows the harness defaults", () => {
	expect(agentProfileOf(HarnessSchema.parse({ preset: "claude" }))).toEqual({
		provider: "anthropic",
		model: "Claude Opus 5",
		effort: "Default",
	});
});

test("a custom harness keeps the generic agent mark", () => {
	expect(
		agentProfileOf(
			HarnessSchema.parse({
				preset: "custom",
				startCommand: "agent {{prompt}}",
				resumeCommand: "agent {{resumeText}}",
			}),
		),
	).toBeUndefined();
});
