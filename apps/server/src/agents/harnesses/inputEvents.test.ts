import { expect, test } from "bun:test";
import { parseClaudeEvent } from "./claude/parseClaudeEvent.ts";
import { CodexAppServerEvents } from "./codex/appServerEvents.ts";
import { applyTurnActivity } from "./turnActivity/turnActivity.ts";

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

test("Codex active flags preserve simultaneous permission and question states", () => {
	const parser = new CodexAppServerEvents("thread");
	const parse = (activeFlags: string[]) =>
		parser.parse({
			method: "thread/status/changed",
			params: { threadId: "thread", status: { type: "active", activeFlags } },
		});
	expect(parse(["waitingOnUserInput", "waitingOnApproval"]).map((event) => event.kind)).toEqual([
		"input-request",
		"input-request",
	]);
	expect(parse(["waitingOnUserInput"]).map((event) => event.kind)).toEqual(["input-request", "input-resolved"]);
	expect(parse([]).map((event) => event.kind)).toEqual(["input-resolved", "input-resolved"]);
	expect(
		parser.parse({ method: "serverRequest/resolved", params: { threadId: "thread", requestId: 7 } })[0],
	).toMatchObject({ requestId: "codex:request:7" });
	expect(parser.parse({ method: "thread/status/changed", params: { threadId: "other" } })).toEqual([]);
});

test("late input resolution does not start an idle bridge turn", () => {
	const current = { turnId: "turn", working: false };
	applyTurnActivity(current, { kind: "input-resolved", requestId: "q" });
	expect(current.working).toBe(false);
});

test("Codex observes nonblocking questions without answering another thread", () => {
	const parser = new CodexAppServerEvents("thread");
	const request = {
		id: 9,
		method: "item/tool/requestUserInput",
		params: { threadId: "thread", turnId: "turn", isBlocking: false },
	};
	expect(parser.parseRequest(request)[0]).toMatchObject({
		kind: "input-request",
		inputRequest: { id: "codex:request:9", blocking: false },
	});
	expect(parser.parseRequest({ ...request, params: { ...request.params, threadId: "child" } })).toEqual([]);
	expect(parser.parseRequest({ ...request, params: { ...request.params, isBlocking: true } })).toEqual([]);
});

test("Claude emits one request for AskUserQuestion even when its permission hook fires", () => {
	expect(
		parseClaudeEvent({ session_id: "s", hook_event_name: "PermissionRequest", tool_name: "AskUserQuestion" }),
	).toEqual([]);
});
