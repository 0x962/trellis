import type { HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export async function prepareCodex(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	const args = input.resume ? ["resume"] : [];
	args.push("--dangerously-bypass-approvals-and-sandbox", "--dangerously-bypass-hook-trust", "--enable", "hooks");
	if (input.model) args.push("--model", input.model);
	for (const event of ["SessionStart", "UserPromptSubmit", "Stop", "Interrupt", "PreToolUse", "PostToolUse"])
		args.push(
			"-c",
			`hooks.${event}=[{hooks=[{type="command",command=${JSON.stringify(input.hookCommand)},timeout=${event === "Interrupt" ? 3 : 10}}]}]`,
		);
	args.push("--");
	if (input.resume) args.push(input.sessionId!);
	args.push(input.prompt);
	return { executable: "codex", args, env: {} };
}
