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

test("an unknown historical model does not use today's default", () => {
	expect(agentProfileOf(HarnessSchema.parse({ preset: "claude" }))).toEqual({
		provider: "anthropic",
		model: "Model not recorded",
	});
});

test("a custom harness uses a neutral profile pill", () => {
	expect(
		agentProfileOf(
			HarnessSchema.parse({
				preset: "custom",
				startCommand: "agent {{prompt}}",
				resumeCommand: "agent {{resumeText}}",
			}),
		),
	).toEqual({ provider: null, model: "Model not recorded" });
});

test("missing harness metadata uses a neutral profile pill", () => {
	expect(agentProfileOf(null)).toEqual({ provider: null, model: "Model not recorded" });
});
