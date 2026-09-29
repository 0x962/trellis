import { describe, expect, test } from "bun:test";
import { HarnessSchema } from "../harness/harness.ts";
import { fromHarnessModel, modelsForHarness, supportsModel, toHarnessModel } from "./models.ts";

describe("Claude models", () => {
	test("preserves the exact Sonnet 5.5 model and accepts medium effort", () => {
		expect(supportsModel("claude", "anthropic/claude-sonnet-5.5")).toBe(true);
		expect(toHarnessModel("claude", "anthropic/claude-sonnet-5.5")).toBe("claude-sonnet-5-5");
		expect(fromHarnessModel("claude", "claude-sonnet-5-5")).toBe("anthropic/claude-sonnet-5.5");
		expect(
			HarnessSchema.parse({ preset: "claude", model: "anthropic/claude-sonnet-5.5", effort: "medium" }).model,
		).toBe("anthropic/claude-sonnet-5.5");
	});
	test("offers Opus 5.5 to the Claude harness under its native name", () => {
		expect(supportsModel("claude", "anthropic/claude-opus-5.5")).toBe(true);
		expect(toHarnessModel("claude", "anthropic/claude-opus-5.5")).toBe("claude-opus-5-5");
	});

	test("maps claude-opus-5-5 back to Opus 5.5, not to Opus 5", () => {
		expect(fromHarnessModel("claude", "claude-opus-5-5")).toBe("anthropic/claude-opus-5.5");
		expect(fromHarnessModel("claude", "claude-opus-5")).toBe("anthropic/claude-opus-5");
	});

	test("reads the Claude Code alias opus as Opus 5.5", () => {
		expect(fromHarnessModel("claude", "opus")).toBe("anthropic/claude-opus-5.5");
	});

	test("keeps the -fast model IDs out of the Claude harness and in the opencode list", () => {
		expect(supportsModel("claude", "anthropic/claude-opus-5.5-fast")).toBe(false);
		expect(modelsForHarness("opencode").some(({ id }) => id === "anthropic/claude-opus-5.5-fast")).toBe(true);
	});
});
