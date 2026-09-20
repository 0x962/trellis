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
					question: 42,
					options: [{ label: "Ignore this invalid question" }],
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
			questions: [
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
					id: "2",
					question: "Which checks should run?",
					options: [{ label: "Lint" }, { label: "Typecheck" }],
					multiple: true,
				},
			],
		},
	});
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
