import { describe, expect, test } from "bun:test";
import { fromHarnessModel, modelsForHarness, supportsModel, toHarnessModel } from "./models.ts";

describe("Claude models", () => {
	test("offers Opus 5.5 to the Claude harness under its native name", () => {
		expect(supportsModel("claude", "anthropic/claude-opus-5.5")).toBe(true);
		expect(toHarnessModel("claude", "anthropic/claude-opus-5.5")).toBe("claude-opus-5-5");
	});

	test("reads the native Opus names back to their own canonical IDs", () => {
		expect(fromHarnessModel("claude", "claude-opus-5-5")).toBe("anthropic/claude-opus-5.5");
		expect(fromHarnessModel("claude", "claude-opus-5")).toBe("anthropic/claude-opus-5");
	});

	test("reads the Claude Code alias opus as Opus 5.5", () => {
		expect(fromHarnessModel("claude", "opus")).toBe("anthropic/claude-opus-5.5");
	});

	test("keeps the Fast gateway variants out of the Claude harness", () => {
		expect(supportsModel("claude", "anthropic/claude-opus-5.5-fast")).toBe(false);
		expect(modelsForHarness("opencode").some(({ id }) => id === "anthropic/claude-opus-5.5-fast")).toBe(true);
	});
});
