import { expect, test } from "bun:test";
import fixture from "../../../test/fixtures/nativeHarness/claude-success.json";
import { ClaudeStream } from "./claudeStream.ts";

const session = "810de346-c1b2-4a0b-8599-2b8a70a95d7d";
test("captured Claude2.1.270 bytes acknowledge the exact user UUID", () => {
	const parser = new ClaudeStream(session);
	const bytes = Buffer.from(`${fixture.map((row) => JSON.stringify(row)).join("\n")}\n`);
	for (let i = 0; i < bytes.length; i += 7) parser.feed(bytes.subarray(i, i + 7));
	expect(parser.snapshot().state).toBe("idle");
	expect(parser.snapshot().acknowledgedMessageIds).toEqual(["fd1e4b3c-e17b-4957-891f-08d41e4e5eb4"]);
	expect(parser.snapshot().result).toBe("TRELLIS_HARNESS_OK");
});
test("initialization establishes readiness but not delivery acceptance", () => {
	const parser = new ClaudeStream(session, "init-id");
	parser.feed(
		Buffer.from(
			`${JSON.stringify({
				type: "control_response",
				response: { subtype: "success", request_id: "init-id", response: {} },
			})}\n`,
		),
	);
	expect(parser.snapshot().state).toBe("ready");
	expect(parser.snapshot().acknowledgedMessageIds).toEqual([]);
});
test("permission request requires a decision and never advances to idle", () => {
	const parser = new ClaudeStream(session);
	parser.feed(
		Buffer.from(
			`${JSON.stringify({
				type: "control_request",
				request_id: "permission-1",
				request: {
					subtype: "can_use_tool",
					tool_name: "Write",
					input: { file_path: "/tmp/file", content: "hello" },
					tool_use_id: "tool-1",
				},
			})}\n`,
		),
	);
	expect(parser.snapshot().state).toBe("needs_input");
	expect(parser.snapshot().pendingPermissions[0]?.requestId).toBe("permission-1");
});
test("foreign sessions and corrupt streams remain unknown", () => {
	const parser = new ClaudeStream(session);
	parser.feed(Buffer.from(`${JSON.stringify({ ...fixture[0], session_id: "other" })}\n`));
	expect(parser.snapshot().state).toBe("unknown");
	expect(parser.snapshot().error).toContain("session");
});
test("tool results are not user delivery acknowledgements", () => {
	const parser = new ClaudeStream(session);
	parser.feed(
		Buffer.from(
			`${JSON.stringify({ type: "user", uuid: "tool-result", session_id: session, parent_tool_use_id: null, message: { role: "user", content: [{ type: "tool_result" }] } })}\n`,
		),
	);
	expect(parser.snapshot().acknowledgedMessageIds).toEqual([]);
});
test("a buffer gap cannot establish readiness from later events", () => {
	const parser = new ClaudeStream(session);
	parser.gap();
	parser.feed(Buffer.from(`${JSON.stringify(fixture[0])}\n`));
	expect(parser.snapshot().state).toBe("unknown");
});
test("the transcript includes user and assistant text without protocol records", () => {
	const parser = new ClaudeStream(session);
	parser.feed(Buffer.from(`${fixture.map((row) => JSON.stringify(row)).join("\n")}\n`));
	expect(parser.snapshot().transcript.map((message) => message.role)).toEqual(["user", "assistant"]);
	expect(parser.snapshot().transcript[1]?.text).toBe("TRELLIS_HARNESS_OK");
});
