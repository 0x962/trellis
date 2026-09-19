import { expect, test } from "bun:test";
import { HARNESS_PRESETS } from "@trellis/api";
import { flowHarnessOf, harnessOfFlow, sameFlowHarness } from "./flowHarness";

test("the form value carries the commands of its preset, and the stored value drops them", () => {
	const stored = { preset: "codex" as const, model: "openai/gpt-5.6-sol", effort: "high" as const };
	const form = harnessOfFlow(stored)!;
	expect(form.startCommand).toBe(HARNESS_PRESETS.codex.startCommand);
	expect(flowHarnessOf(form)).toEqual(stored);
	expect(flowHarnessOf({ ...form, model: undefined, effort: undefined })).toEqual({ preset: "codex" });
	expect(harnessOfFlow(null)).toBeNull();
	expect(harnessOfFlow(undefined)).toBeNull();
	expect(flowHarnessOf(null)).toBeNull();
});

test("sameFlowHarness treats a missing field and null as equal", () => {
	expect(sameFlowHarness(null, undefined)).toBe(true);
	expect(sameFlowHarness({ preset: "claude" }, { preset: "claude" })).toBe(true);
	expect(sameFlowHarness({ preset: "claude" }, { preset: "claude", effort: "high" })).toBe(false);
	expect(sameFlowHarness({ preset: "claude" }, null)).toBe(false);
});
