import type { HarnessEffort } from "@trellis/api";

export type { HarnessEvent, HarnessTool } from "@trellis/runtime-protocol";

export type BuiltInHarness = "claude" | "codex" | "opencode" | "pi" | "muse";

// One model a harness program listed. `name` is what that program takes on
// its own model flag, and `label` is the name it shows for the model.
// `listHarnessModels` turns `name` into a canonical trellis model id.
export type ListedModel = { name: string; label: string };

export type HarnessLaunchInput = {
	cwd: string;
	prompt: string;
	model?: string;
	effort?: HarnessEffort;
	hookCommand: string;
	configDirectory: string;
	env?: Record<string, string>;
} & (
	| { managerTools: { command: string; args: string[] }; managerSystemPrompt: string }
	| { managerTools?: undefined; managerSystemPrompt?: never }
) &
	({ resume: false; sessionId?: string } | { resume: true; sessionId: string });

export type HarnessLaunch = {
	executable: string;
	args: string[];
	env: Record<string, string>;
};
