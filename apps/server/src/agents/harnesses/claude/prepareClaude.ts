import type { HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export async function prepareClaude(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	const events = [
		"SessionStart",
		"PostModelSwitch",
		"UserPromptSubmit",
		"Stop",
		"StopFailure",
		"PreToolUse",
		"PostToolUse",
		"PostToolUseFailure",
		"PermissionRequest",
		"Elicitation",
		"ElicitationResult",
	];
	const hooks = Object.fromEntries(
		events.map((event) => [event, [{ hooks: [{ type: "command", command: input.hookCommand, timeout: 10 }] }]]),
	);
	const args = input.textOnly
		? [
				"--tools",
				"",
				"--strict-mcp-config",
				"--mcp-config",
				'{"mcpServers":{}}',
				"--disable-slash-commands",
				"--setting-sources",
				"",
				"--system-prompt-file",
				input.textOnly.systemPath,
			]
		: ["--dangerously-skip-permissions"];
	args.push("--settings", JSON.stringify({ hooks }));
	if (input.model) args.push("--model", input.model);
	if (input.effort) args.push("--effort", input.effort);
	args.push(
		input.resume ? "--resume" : "--session-id",
		input.resume ? input.sessionId! : (input.sessionId ?? crypto.randomUUID()),
	);
	if (!input.textOnly) args.push("--", input.prompt);
	return {
		executable: "claude",
		args,
		env: {},
	};
}
