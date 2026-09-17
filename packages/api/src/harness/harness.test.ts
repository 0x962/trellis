import { expect, test } from "bun:test";
import {
	BuiltInHarnessSchema,
	HARNESS_PRESETS,
	HarnessModelSchema,
	HarnessPresetSchema,
	HarnessSchema,
} from "./harness.ts";

test("built-in harness settings retain an explicit model", () => {
	expect(HarnessSchema.parse({ preset: "codex", model: " openai/gpt-5.6-sol " }).model).toBe("openai/gpt-5.6-sol");
	expect(HarnessSchema.safeParse({ preset: "codex", model: " " }).success).toBe(false);
});

test("project harness choices contain the supported programs and custom commands", () => {
	expect(Object.keys(HARNESS_PRESETS)).toEqual(["claude", "codex", "opencode", "pi", "muse"]);
	expect(HarnessPresetSchema.options).toEqual(["claude", "codex", "opencode", "pi", "muse", "custom"]);
	expect(BuiltInHarnessSchema.options).toEqual(["claude", "codex", "opencode", "pi", "muse"]);
});

test("a model picker choice carries a canonical model id and the name the harness shows", () => {
	expect(HarnessModelSchema.parse({ value: "anthropic/claude-sonnet-5", label: "Sonnet" })).toEqual({
		value: "anthropic/claude-sonnet-5",
		label: "Sonnet",
	});
	// A project stores this value, and `HarnessSchema` takes a catalog id only.
	expect(HarnessModelSchema.safeParse({ value: "sonnet", label: "Sonnet" }).success).toBe(false);
	expect(HarnessModelSchema.safeParse({ value: "anthropic/claude-sonnet-5", label: "" }).success).toBe(false);
});

test.each(["claude", "codex", "opencode", "muse"] as const)(
	"%s starts and resumes without tool approval prompts",
	(preset) => {
		const bypass = {
			claude: "--dangerously-skip-permissions",
			codex: "--dangerously-bypass-approvals-and-sandbox",
			opencode: `OPENCODE_PERMISSION='{"*":"allow"}'`,
			muse: "--yolo",
		}[preset];
		expect(HARNESS_PRESETS[preset].startCommand).toContain(bypass);
		expect(HARNESS_PRESETS[preset].resumeCommand).toContain(bypass);
	},
);

test("Pi enables its tools without an unsupported permission flag", () => {
	expect(HARNESS_PRESETS.pi.startCommand).toContain("--tools read,bash,edit,write,grep,find,ls");
	expect(HARNESS_PRESETS.pi.resumeCommand).toContain("--tools read,bash,edit,write,grep,find,ls");
});

test("an unset model stays unset in saved settings so resumed sessions keep their own model", () => {
	for (const preset of Object.keys(HARNESS_PRESETS)) expect(HarnessSchema.parse({ preset }).model).toBeUndefined();
});
