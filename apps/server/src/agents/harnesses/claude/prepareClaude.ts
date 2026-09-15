import type { HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export async function prepareClaude(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	const events = [
		"SessionStart",
		"UserPromptSubmit",
		"Stop",
		"StopFailure",
		"PreToolUse",
		"PostToolUse",
		"PostToolUseFailure",
	];
	const hooks = Object.fromEntries(
		events.map((event) => [event, [{ hooks: [{ type: "command", command: input.hookCommand, timeout: 10 }] }]]),
	);
	const args = ["--dangerously-skip-permissions", "--settings", JSON.stringify({ hooks })];
	if (input.model) args.push("--model", input.model);
	args.push(
		input.resume ? "--resume" : "--session-id",
		input.resume ? input.sessionId! : (input.sessionId ?? crypto.randomUUID()),
	);
	args.push("--", input.prompt);
	return { executable: "claude", args, env: {} };
}
