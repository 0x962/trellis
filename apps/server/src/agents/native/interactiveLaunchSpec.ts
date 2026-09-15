import type { HarnessPreset } from "@trellis/api";
import type { LaunchSpec } from "@trellis/runtime-protocol";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export const interactiveLaunchSpec = (input: {
	id: string;
	command: string;
	cwd: string;
	env: Record<string, string>;
	preset: HarnessPreset;
	hookCommand: string;
	timeoutMs?: number;
}): LaunchSpec => {
	const hooks = Object.fromEntries(
		["SessionStart", "UserPromptSubmit", "Stop"].map((event) => [
			event,
			[{ hooks: [{ type: "command", command: input.hookCommand, timeout: 10 }] }],
		]),
	);
	const command =
		input.preset === "claude" ? `${input.command} --settings ${quote(JSON.stringify({ hooks }))}` : input.command;
	return {
		id: input.id,
		command: "/bin/zsh",
		args: ["-f", "-c", command],
		cwd: input.cwd,
		env: input.env,
		mode: "pty",
		cols: 120,
		rows: 32,
		timeoutMs: input.timeoutMs,
	};
};
