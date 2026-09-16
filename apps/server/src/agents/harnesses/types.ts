export type { HarnessEvent, HarnessTool } from "@trellis/runtime-protocol";

export type BuiltInHarness = "claude" | "codex" | "opencode" | "pi" | "muse";

export type HarnessLaunchInput = {
	cwd: string;
	prompt: string;
	model?: string;
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
