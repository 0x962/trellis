export type { HarnessEvent, HarnessTool } from "@trellis/runtime-protocol";

export type BuiltInHarness = "claude" | "codex" | "agy" | "opencode" | "pi";

export type HarnessLaunchInput = {
	cwd: string;
	prompt: string;
	model?: string;
	hookCommand: string;
	configDirectory: string;
} & ({ resume: false; sessionId?: string } | { resume: true; sessionId: string });

export type HarnessLaunch = {
	executable: string;
	args: string[];
	env: Record<string, string>;
};
