import { z } from "zod";
import { AgentCommandSchema } from "../agentCommand/agentCommand.ts";
import { DEFAULT_AGENT_RESUME_COMMAND, DEFAULT_AGENT_START_COMMAND } from "../agentLaunch/agentLaunch.ts";

export const HARNESS_PRESETS = {
	claude: { startCommand: DEFAULT_AGENT_START_COMMAND, resumeCommand: DEFAULT_AGENT_RESUME_COMMAND },
	codex: { startCommand: "codex {{prompt}}", resumeCommand: "codex resume --last {{resumeText}}" },
	agy: {
		startCommand: "agy --prompt-interactive {{prompt}}",
		resumeCommand: "agy --continue --prompt-interactive {{resumeText}}",
	},
	opencode: {
		startCommand: "opencode --prompt {{prompt}}",
		resumeCommand: "opencode --continue --prompt {{resumeText}}",
	},
	pi: { startCommand: "pi {{prompt}}", resumeCommand: "pi --continue {{resumeText}}" },
};
export const HarnessPresetSchema = z.enum(["claude", "codex", "agy", "opencode", "pi", "custom"]);
export type HarnessPreset = z.infer<typeof HarnessPresetSchema>;
export const HarnessSchema = z
	.strictObject({
		preset: HarnessPresetSchema,
		startCommand: AgentCommandSchema.optional(),
		resumeCommand: AgentCommandSchema.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.preset !== "custom") return;
		for (const key of ["startCommand", "resumeCommand"] as const) {
			if (!value[key]) ctx.addIssue({ code: "custom", path: [key], message: "Enter the command." });
		}
	})
	.transform((value) => ({
		preset: value.preset,
		startCommand: value.startCommand ?? HARNESS_PRESETS[value.preset as keyof typeof HARNESS_PRESETS].startCommand,
		resumeCommand: value.resumeCommand ?? HARNESS_PRESETS[value.preset as keyof typeof HARNESS_PRESETS].resumeCommand,
	}));
export type Harness = z.infer<typeof HarnessSchema>;
export const harnessFromCommands = (startCommand: string, resumeCommand: string): Harness => ({
	preset:
		(Object.entries(HARNESS_PRESETS).find(
			([, commands]) => commands.startCommand === startCommand && commands.resumeCommand === resumeCommand,
		)?.[0] as HarnessPreset | undefined) ?? "custom",
	startCommand,
	resumeCommand,
});
