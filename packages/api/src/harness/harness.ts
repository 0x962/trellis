import { z } from "zod";
import { AgentCommandSchema } from "../agentCommand/agentCommand.ts";
import { DEFAULT_AGENT_RESUME_COMMAND, DEFAULT_AGENT_START_COMMAND } from "../agentLaunch/agentLaunch.ts";
import { ModelIdSchema, supportsModel } from "../models/models.ts";

export const HARNESS_DEFAULT_MODELS = {
	claude: "anthropic/claude-opus-5",
	codex: "openai/gpt-5.6-sol",
	opencode: "anthropic/claude-opus-5",
	pi: "openai/gpt-5.6-sol",
	muse: "meta/muse-spark-1.3",
} as const;

export const HARNESS_PRESETS = {
	claude: { startCommand: DEFAULT_AGENT_START_COMMAND, resumeCommand: DEFAULT_AGENT_RESUME_COMMAND },
	codex: {
		startCommand: "codex --dangerously-bypass-approvals-and-sandbox {{prompt}}",
		resumeCommand: "codex resume --dangerously-bypass-approvals-and-sandbox --last {{resumeText}}",
	},
	opencode: {
		startCommand: `OPENCODE_PERMISSION='{"*":"allow"}' opencode --prompt {{prompt}}`,
		resumeCommand: `OPENCODE_PERMISSION='{"*":"allow"}' opencode --continue --prompt {{resumeText}}`,
	},
	pi: {
		startCommand: "pi --tools read,bash,edit,write,grep,find,ls {{prompt}}",
		resumeCommand: "pi --tools read,bash,edit,write,grep,find,ls --continue {{resumeText}}",
	},
	// `muse resume` takes no prompt argument, so a custom Muse resume opens
	// the last session and a person types the instruction.
	muse: {
		startCommand: "muse --yolo {{prompt}}",
		resumeCommand: "muse --yolo resume --last",
	},
};
export const HarnessPresetSchema = z.enum(["claude", "codex", "opencode", "pi", "muse", "custom"]);
export type HarnessPreset = z.infer<typeof HarnessPresetSchema>;
export const HarnessSchema = z
	.strictObject({
		preset: HarnessPresetSchema,
		model: ModelIdSchema.optional(),
		startCommand: AgentCommandSchema.optional(),
		resumeCommand: AgentCommandSchema.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.model && !supportsModel(value.preset, value.model))
			ctx.addIssue({ code: "custom", path: ["model"], message: `Select a model supported by ${value.preset}.` });
		if (value.preset !== "custom") return;
		for (const key of ["startCommand", "resumeCommand"] as const) {
			if (!value[key]) ctx.addIssue({ code: "custom", path: [key], message: "Enter the command." });
		}
	})
	.transform((value) => ({
		preset: value.preset,
		...(value.model === undefined ? {} : { model: value.model }),
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
