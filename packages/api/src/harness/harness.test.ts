import { expect, test } from "bun:test";
import { HARNESS_PRESETS, HarnessPresetSchema } from "./harness.ts";

test("project harness choices contain the supported programs and custom commands", () => {
	expect(Object.keys(HARNESS_PRESETS)).toEqual(["claude", "codex", "opencode", "pi"]);
	expect(HarnessPresetSchema.options).toEqual(["claude", "codex", "opencode", "pi", "custom"]);
});

test.each(["claude", "codex", "opencode"] as const)("%s starts and resumes without tool approval prompts", (preset) => {
	const bypass = {
		claude: "--dangerously-skip-permissions",
		codex: "--dangerously-bypass-approvals-and-sandbox",
		opencode: `OPENCODE_PERMISSION='{"*":"allow"}'`,
	}[preset];
	expect(HARNESS_PRESETS[preset].startCommand).toContain(bypass);
	expect(HARNESS_PRESETS[preset].resumeCommand).toContain(bypass);
});

test("Pi enables its tools without an unsupported permission flag", () => {
	expect(HARNESS_PRESETS.pi.startCommand).toContain("--tools read,bash,edit,write,grep,find,ls");
	expect(HARNESS_PRESETS.pi.resumeCommand).toContain("--tools read,bash,edit,write,grep,find,ls");
});
