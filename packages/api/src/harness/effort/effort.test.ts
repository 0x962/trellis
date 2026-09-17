import { expect, test } from "bun:test";
import { HarnessSchema } from "../harness.ts";
import { effortForHarness } from "./effort.ts";

test("effort choices use the harness label and the selected model", () => {
	expect(effortForHarness("claude", "anthropic/claude-opus-5")).toMatchObject({ label: "Effort" });
	expect(effortForHarness("claude", "anthropic/claude-3-haiku")).toBeNull();
	expect(effortForHarness("codex", "openai/gpt-5.6-sol")?.options.map(({ value }) => value)).toEqual([
		"low",
		"medium",
		"high",
		"xhigh",
		"max",
		"ultra",
	]);
	expect(effortForHarness("codex", "openai/gpt-5.6-luna")?.options.map(({ value }) => value)).not.toContain("ultra");
	expect(effortForHarness("pi", "anthropic/claude-opus-4.6")?.label).toBe("Thinking level");
	expect(effortForHarness("opencode", "anthropic/claude-opus-5")?.label).toBe("Variant");
	expect(effortForHarness("custom", "openai/gpt-5.6-sol")).toBeNull();
});

test("harness settings retain supported effort and reject unsupported combinations", () => {
	expect(HarnessSchema.parse({ preset: "codex", model: "openai/gpt-5.6-sol", effort: "ultra" }).effort).toBe("ultra");
	expect(HarnessSchema.safeParse({ preset: "codex", model: "openai/gpt-5.6-luna", effort: "ultra" }).success).toBe(
		false,
	);
	expect(HarnessSchema.safeParse({ preset: "claude", model: "anthropic/claude-3-haiku", effort: "high" }).success).toBe(
		false,
	);
	expect(HarnessSchema.parse({ preset: "claude", effort: "high" }).effort).toBe("high");
	expect(HarnessSchema.parse({ preset: "claude" })).not.toHaveProperty("effort");
});
