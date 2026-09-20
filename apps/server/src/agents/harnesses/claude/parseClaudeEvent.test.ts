import { expect, test } from "bun:test";
import { parseClaudeEvent } from "./parseClaudeEvent.ts";

test("Claude reads AskUserQuestion questions from the tool input", () => {
	const events = parseClaudeEvent({
		hook_event_name: "PreToolUse",
		session_id: "session",
		tool_use_id: "tool",
		tool_name: "AskUserQuestion",
		tool_input: {
			questions: [
				{
					question: "Which database should this service use?",
					header: "Database",
					options: [
						{ label: "PGlite", description: "Keep the database local", preview: true },
						{ label: "Postgres", description: "Use a remote database" },
					],
				},
				{
					question: "Which checks should run?",
					header: "Checks",
					options: [{ label: "Lint" }, { label: "Typecheck" }],
					multiSelect: true,
				},
			],
			metadata: { source: "test" },
		},
	});

	expect(events[0]).toMatchObject({
		kind: "input-request",
		inputRequest: {
			id: "tool",
			kind: "question",
			title: "The agent has a question in the terminal",
			blocking: true,
		},
	});
	expect(events[0]?.inputRequest?.questions).toEqual([
		{
			id: "0",
			question: "Which database should this service use?",
			options: [
				{ label: "PGlite", description: "Keep the database local" },
				{ label: "Postgres", description: "Use a remote database" },
			],
			multiple: false,
		},
		{
			id: "1",
			question: "Which checks should run?",
			options: [{ label: "Lint" }, { label: "Typecheck" }],
			multiple: true,
		},
	]);
});

test("Claude rejects a malformed AskUserQuestion question", () => {
	expect(() =>
		parseClaudeEvent({
			hook_event_name: "PreToolUse",
			session_id: "session",
			tool_use_id: "tool",
			tool_name: "AskUserQuestion",
			tool_input: {
				questions: [{ question: 42, options: [] }],
			},
		}),
	).toThrow();
});

test("Claude reports main-agent questions and resolves the matching tool", () => {
	const input = { session_id: "session", tool_use_id: "tool", tool_name: "AskUserQuestion" };
	const events = parseClaudeEvent({ ...input, hook_event_name: "PreToolUse" });
	expect(events[0]).toMatchObject({ kind: "input-request", inputRequest: { id: "tool", kind: "question" } });
	expect(parseClaudeEvent({ ...input, hook_event_name: "PostToolUse" })[0]).toMatchObject({
		kind: "input-resolved",
		requestId: "tool",
	});
	expect(parseClaudeEvent({ ...input, hook_event_name: "Stop", agent_id: "child" })).toEqual([]);
});

test("Claude permissions and MCP responses use distinct request identities", () => {
	expect(
		parseClaudeEvent({ session_id: "s", hook_event_name: "PermissionRequest", tool_name: "Bash" })[0],
	).toMatchObject({ inputRequest: { id: "permission:Bash", kind: "permission" } });
	const identity = { session_id: "s", elicitation_id: "one", mcp_server_name: "test" };
	expect(parseClaudeEvent({ ...identity, hook_event_name: "Elicitation" })[0]).toMatchObject({
		inputRequest: { id: "elicitation:one" },
	});
	expect(parseClaudeEvent({ ...identity, hook_event_name: "ElicitationResult" })[0]).toMatchObject({
		requestId: "elicitation:one",
	});
});

test("Claude emits one request for AskUserQuestion even when its permission hook fires", () => {
	expect(
		parseClaudeEvent({ session_id: "s", hook_event_name: "PermissionRequest", tool_name: "AskUserQuestion" }),
	).toEqual([]);
});

test("Claude keeps the terminal title when the tool input has no question", () => {
	const events = parseClaudeEvent({
		hook_event_name: "PreToolUse",
		session_id: "session",
		tool_use_id: "tool",
		tool_name: "AskUserQuestion",
		tool_input: {},
	});

	expect(events[0]).toMatchObject({
		kind: "input-request",
		inputRequest: {
			id: "tool",
			kind: "question",
			title: "The agent has a question in the terminal",
			blocking: true,
		},
	});
	expect(events[0]?.inputRequest).not.toHaveProperty("questions");
});
