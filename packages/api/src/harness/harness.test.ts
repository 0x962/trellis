import { expect, test } from "bun:test";
import { HARNESS_PRESETS } from "./harness.ts";

test.each(["claude", "codex", "agy", "opencode"] as const)(
	"%s starts and resumes without tool approval prompts",
	(preset) => {
		const bypass = {
			claude: "--dangerously-skip-permissions",
			codex: "--dangerously-bypass-approvals-and-sandbox",
			agy: "--dangerously-skip-permissions",
			opencode: `OPENCODE_PERMISSION='{"*":"allow"}'`,
		}[preset];
		expect(HARNESS_PRESETS[preset].startCommand).toContain(bypass);
		expect(HARNESS_PRESETS[preset].resumeCommand).toContain(bypass);
	},
);

test("Pi enables its tools without an unsupported permission flag", () => {
	expect(HARNESS_PRESETS.pi.startCommand).toContain("--tools read,bash,edit,write,grep,find,ls");
	expect(HARNESS_PRESETS.pi.resumeCommand).toContain("--tools read,bash,edit,write,grep,find,ls");
});
