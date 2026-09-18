import { expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { launchedHarness } from "./launchedHarness.ts";

const claude = HarnessSchema.parse({ preset: "claude" });

test("the model the harness program reported joins the stored harness", () => {
	expect(launchedHarness(claude, "anthropic/claude-opus-5")).toEqual({ ...claude, model: "anthropic/claude-opus-5" });
});

test("the reported model replaces the requested model", () => {
	const sonnet = HarnessSchema.parse({ preset: "claude", model: "anthropic/claude-sonnet-5" });
	expect(launchedHarness(sonnet, "anthropic/claude-opus-5").model).toBe("anthropic/claude-opus-5");
});

test("a harness program that reported no model leaves the stored harness alone", () => {
	expect(launchedHarness(claude, null)).toEqual(claude);
	expect(launchedHarness(claude, undefined)).toEqual(claude);
});

test("a name outside the model catalog stays out of the stored harness", () => {
	expect(launchedHarness(claude, "anthropic/claude-opus-7")).toEqual(claude);
});

test("a model that another harness serves stays out of the stored harness", () => {
	expect(launchedHarness(claude, "openai/gpt-5.6-sol")).toEqual(claude);
});

test("a custom command stores no model", () => {
	const custom = HarnessSchema.parse({
		preset: "custom",
		startCommand: "agent {{prompt}}",
		resumeCommand: "agent {{resumeText}}",
	});
	expect(launchedHarness(custom, "anthropic/claude-opus-5")).toEqual(custom);
});
