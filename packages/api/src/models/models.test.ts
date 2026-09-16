import { expect, test } from "bun:test";
import { HarnessSchema } from "../harness/harness.ts";
import { fromHarnessModel, ModelIdSchema, modelsForHarness, toHarnessModel } from "./models.ts";

test("model choices use gateway IDs from all four providers", () => {
	const models = modelsForHarness("pi");
	expect(new Set(models.map((model) => model.id.split("/")[0]))).toEqual(
		new Set(["google", "anthropic", "meta", "openai"]),
	);
	expect(ModelIdSchema.safeParse("sonnet").success).toBe(false);
	expect(ModelIdSchema.safeParse("openai/invented").success).toBe(false);
	expect(ModelIdSchema.parse("anthropic/claude-sonnet-4.6")).toBe("anthropic/claude-sonnet-4.6");
	expect(HarnessSchema.safeParse({ preset: "claude", model: "openai/gpt-5.6-sol" }).success).toBe(false);
	expect(modelsForHarness("custom")).toEqual([]);
});

test("harness names round trip to canonical IDs", () => {
	for (const [harness, canonical, native] of [
		["claude", "anthropic/claude-sonnet-4.6", "claude-sonnet-4-6"],
		["claude", "anthropic/claude-haiku-4.5", "claude-haiku-4-5-20251001"],
		["codex", "openai/gpt-5.6-sol", "gpt-5.6-sol"],
		["opencode", "google/gemini-3.8-flash", "vercel/google/gemini-3.8-flash"],
		["pi", "meta/llama-4-scout", "vercel-ai-gateway/meta/llama-4-scout"],
	] as const) {
		expect(toHarnessModel(harness, canonical)).toBe(native);
		expect(fromHarnessModel(harness, native)).toBe(canonical);
	}
	expect(fromHarnessModel("claude", "sonnet")).toBe("anthropic/claude-sonnet-5");
	expect(fromHarnessModel("claude", "claude-sonnet-4-20250514")).toBe("anthropic/claude-sonnet-4");
	expect(fromHarnessModel("pi", "openai/gpt-5.6-sol")).toBe("openai/gpt-5.6-sol");
	expect(fromHarnessModel("opencode", "anthropic/claude-sonnet-4-6")).toBe("anthropic/claude-sonnet-4.6");
	expect(fromHarnessModel("codex", "openai/future-model")).toBe("openai/future-model");
	expect(() => toHarnessModel("codex", "meta/llama-4-scout")).toThrow();
});
