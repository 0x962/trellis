import type { LaunchSpec } from "@trellis/runtime-protocol";

export function claudeLaunchSpec(input: {
	attemptId: string;
	sessionId: string;
	cwd: string;
	env?: Record<string, string>;
	resume?: boolean;
	systemPrompt?: string;
	executable?: string;
	timeoutMs?: number;
}): LaunchSpec {
	const args = [
		"--print",
		"--input-format",
		"stream-json",
		"--output-format",
		"stream-json",
		"--verbose",
		"--replay-user-messages",
		"--permission-mode",
		"manual",
		"--permission-prompt-tool",
		"stdio",
		...(input.resume ? ["--resume", input.sessionId] : ["--session-id", input.sessionId]),
	];
	if (input.systemPrompt) args.push("--append-system-prompt", input.systemPrompt);
	return {
		id: input.attemptId,
		command: input.executable ?? "claude",
		args,
		cwd: input.cwd,
		env: input.env,
		mode: "stdio",
		separateStderr: true,
		timeoutMs: input.timeoutMs,
	};
}
