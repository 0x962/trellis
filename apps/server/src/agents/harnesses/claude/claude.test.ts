import { expect, test } from "bun:test";
import { parseClaudeEvent } from "./parseClaudeEvent.ts";
import { parseClaudeStatus } from "./parseClaudeStatus.ts";
import { prepareClaude } from "./prepareClaude.ts";

const input = {
	cwd: "/tmp/project",
	prompt: "a 'quoted' prompt",
	model: "sonnet",
	sessionId: "e2c9257e-f163-4904-81bd-21c03de6f711",
	resume: false as const,
	hookCommand: "/bin/bun '/tmp/hook file.ts'",
	configDirectory: "/tmp/attempt",
};

test("Claude starts its native TUI with exact arguments and per-attempt hooks", async () => {
	const launch = await prepareClaude(input);
	expect(launch.executable).toBe("claude");
	expect(launch.args).toContain("--dangerously-skip-permissions");
	expect(launch.args.slice(launch.args.indexOf("--model"), launch.args.indexOf("--model") + 2)).toEqual([
		"--model",
		"sonnet",
	]);
	expect(launch.args).toContain(input.sessionId);
	expect(launch.args.at(-1)).toBe(input.prompt);
	const settings = JSON.parse(launch.args[launch.args.indexOf("--settings") + 1]!);
	for (const event of [
		"SessionStart",
		"UserPromptSubmit",
		"Stop",
		"StopFailure",
		"PreToolUse",
		"PostToolUse",
		"PostToolUseFailure",
	])
		expect(settings.hooks[event][0].hooks[0].command).toBe(input.hookCommand);
	expect(launch.env).toEqual({});
});

test("Claude resumes the supplied vendor ID with bypass and model", async () => {
	const launch = await prepareClaude({ ...input, resume: true });
	expect(launch.args.slice(launch.args.indexOf("--resume"), launch.args.indexOf("--resume") + 2)).toEqual([
		"--resume",
		input.sessionId,
	]);
	expect(launch.args).toContain("--dangerously-skip-permissions");
	expect(launch.args).toContain("sonnet");
});

test("Claude events preserve native identity, prompt, tool data, and final response", () => {
	const base = { session_id: input.sessionId, model: "sonnet" };
	expect(parseClaudeEvent({ ...base, hook_event_name: "SessionStart" })).toEqual([
		{ kind: "session", sessionId: input.sessionId, model: "sonnet" },
	]);
	expect(
		parseClaudeEvent({ ...base, hook_event_name: "UserPromptSubmit", prompt: "trellis-message:id\nhello" })[0],
	).toMatchObject({ kind: "prompt", prompt: "trellis-message:id\nhello" });
	expect(
		parseClaudeEvent({
			...base,
			hook_event_name: "PreToolUse",
			tool_use_id: "t1",
			tool_name: "Bash",
			tool_input: { command: "pwd" },
		})[0],
	).toMatchObject({ kind: "tool-start", tool: { id: "t1", name: "Bash", input: { command: "pwd" } } });
	expect(
		parseClaudeEvent({
			...base,
			hook_event_name: "PostToolUse",
			tool_use_id: "t1",
			tool_name: "Bash",
			tool_response: { stdout: "/tmp" },
		})[0],
	).toMatchObject({ kind: "tool-end", tool: { id: "t1", output: { stdout: "/tmp" } } });
	expect(parseClaudeEvent({ ...base, hook_event_name: "Stop", last_assistant_message: "Done" })[0]).toMatchObject({
		kind: "idle",
		result: "Done",
	});
});

test("Claude reports API and tool failures without a successful result", () => {
	const base = { session_id: input.sessionId };
	expect(
		parseClaudeEvent({ ...base, hook_event_name: "StopFailure", error: "rate_limit", error_details: "Try later" })[0],
	).toMatchObject({ kind: "error", error: "Try later" });
	expect(
		parseClaudeEvent({
			...base,
			hook_event_name: "PostToolUseFailure",
			tool_use_id: "t",
			tool_name: "Bash",
			error: "exit 1",
		})[0],
	).toMatchObject({ kind: "tool-end", error: "exit 1" });
});

test("Claude status selects the exact interactive process and does not infer idle from absence", () => {
	const rows = [
		{ kind: "interactive", sessionId: "other", pid: 41, status: "idle" },
		{ kind: "interactive", sessionId: input.sessionId, pid: 42, status: "idle" },
	];
	expect(parseClaudeStatus(rows, { sessionId: input.sessionId, pid: 42 })).toEqual({ status: "idle" });
	expect(parseClaudeStatus(rows, { sessionId: input.sessionId, pid: 43 })).toBeNull();
	expect(
		parseClaudeStatus([{ ...rows[1], status: "waiting", waitingFor: "permission" }], {
			sessionId: input.sessionId,
			pid: 42,
		}),
	).toEqual({ status: "waiting", waitingFor: "permission" });
});

test("Claude keeps prompt receipts independent from a stale native prompt ID", () => {
	const base = { session_id: input.sessionId, prompt_id: "native-prompt-id" };
	expect(parseClaudeEvent({ ...base, hook_event_name: "UserPromptSubmit", prompt: "hello" })[0]).toEqual({
		kind: "prompt",
		sessionId: input.sessionId,
		prompt: "hello",
	});
	expect(parseClaudeEvent({ ...base, hook_event_name: "Stop", last_assistant_message: "done" })[0]).toMatchObject({
		kind: "idle",
		turnId: "native-prompt-id",
		outcome: "completed",
	});
});

test("Claude model changes update metadata without a turn transition", () => {
	expect(
		parseClaudeEvent({
			hook_event_name: "PostModelSwitch",
			session_id: "s",
			to_model: "claude-sonnet-5",
			source: "resume",
		}),
	).toEqual([{ kind: "session", sessionId: "s", model: "claude-sonnet-5" }]);
});

test("Claude associates the first tool with its current native prompt ID", () => {
	const receipt = parseClaudeEvent({
		session_id: "s",
		hook_event_name: "UserPromptSubmit",
		prompt_id: "completed-prompt",
		prompt: "trellis-message:new\nrun",
	})[0]!;
	const tool = parseClaudeEvent({
		session_id: "s",
		hook_event_name: "PreToolUse",
		prompt_id: "current-prompt",
		tool_use_id: "tool",
		tool_name: "Bash",
		tool_input: { command: "sleep 30" },
	})[0]!;
	expect(receipt.turnId).toBeUndefined();
	expect(tool.turnId).toBe("current-prompt");
});
