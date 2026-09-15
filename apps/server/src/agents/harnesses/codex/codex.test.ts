import { expect, test } from "bun:test";
import { parseCodexEvent } from "./parseCodexEvent.ts";
import { prepareCodex } from "./prepareCodex.ts";

const input = {
	cwd: "/tmp/project",
	prompt: "a 'quoted' prompt",
	model: "gpt-6",
	sessionId: "vendor-session",
	resume: false as const,
	hookCommand: "/bin/bun '/tmp/hook file.ts'",
	configDirectory: "/tmp/attempt",
};

test("Codex native launch injects trusted hooks without a separate config home", async () => {
	const launch = await prepareCodex(input);
	expect(launch.executable).toBe("codex");
	expect(launch.args).toContain("--dangerously-bypass-approvals-and-sandbox");
	expect(launch.args).toContain("--dangerously-bypass-hook-trust");
	expect(launch.args).toContain("gpt-6");
	expect(launch.args.at(-1)).toBe(input.prompt);
	for (const event of ["SessionStart", "UserPromptSubmit", "Stop", "Interrupt", "PreToolUse", "PostToolUse"])
		expect(launch.args.some((arg) => arg.startsWith(`hooks.${event}=`) && arg.includes("hook file.ts"))).toBe(true);
	expect(launch.env).toEqual({});
});

test("Codex resumes the exact vendor session ID", async () => {
	const launch = await prepareCodex({ ...input, resume: true });
	expect(launch.args[0]).toBe("resume");
	expect(launch.args.slice(-2)).toEqual([input.sessionId, input.prompt]);
});

test("Codex native hooks expose receipt, tool, result, and interrupt", () => {
	const base = { session_id: input.sessionId, turn_id: "turn-1", model: input.model };
	expect(parseCodexEvent({ ...base, hook_event_name: "SessionStart" })[0]).toMatchObject({
		kind: "session",
		sessionId: input.sessionId,
	});
	expect(parseCodexEvent({ ...base, hook_event_name: "UserPromptSubmit", prompt: "hello" })[0]).toMatchObject({
		kind: "prompt",
		prompt: "hello",
	});
	expect(
		parseCodexEvent({
			...base,
			hook_event_name: "PreToolUse",
			tool_use_id: "t",
			tool_name: "Bash",
			tool_input: { command: "pwd" },
		})[0],
	).toMatchObject({ kind: "tool-start", tool: { id: "t", name: "Bash" } });
	expect(
		parseCodexEvent({
			...base,
			hook_event_name: "PostToolUse",
			tool_use_id: "t",
			tool_name: "Bash",
			tool_response: "ok",
		})[0],
	).toMatchObject({ kind: "tool-end", tool: { id: "t", output: "ok" } });
	expect(parseCodexEvent({ ...base, hook_event_name: "Stop", last_assistant_message: "Done" })[0]).toMatchObject({
		kind: "idle",
		result: "Done",
	});
	expect(parseCodexEvent({ ...base, hook_event_name: "Interrupt" })[0]).toMatchObject({ kind: "idle" });
});

test("Codex ignores subagent completions and rejects malformed native receipts", () => {
	expect(
		parseCodexEvent({ hook_event_name: "SubagentStop", session_id: "parent", last_assistant_message: "child done" }),
	).toEqual([]);
	expect(() => parseCodexEvent({ hook_event_name: "UserPromptSubmit", session_id: "s" })).toThrow();
});

test("Codex preserves the interrupted turn ID and distinguishes it from completion", () => {
	expect(parseCodexEvent({ hook_event_name: "Interrupt", session_id: "s", turn_id: "t" })).toEqual([
		{ kind: "idle", outcome: "interrupted", sessionId: "s", turnId: "t" },
	]);
});

test("Codex does not bind a prompt receipt to the preceding turn ID", () => {
	const event = parseCodexEvent({
		session_id: "s",
		hook_event_name: "UserPromptSubmit",
		turn_id: "preceding-turn",
		prompt: "trellis-message:new\nrun",
	})[0]!;
	expect(event).toEqual({ kind: "prompt", sessionId: "s", prompt: "trellis-message:new\nrun" });
	expect(
		parseCodexEvent({
			session_id: "s",
			hook_event_name: "PreToolUse",
			turn_id: "current-turn",
			tool_use_id: "tool",
			tool_name: "Bash",
		})[0]?.turnId,
	).toBe("current-turn");
});
