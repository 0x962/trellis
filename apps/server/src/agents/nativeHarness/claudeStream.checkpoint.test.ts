import { expect, test } from "bun:test";
import { ClaudeStream } from "./claudeStream.ts";

const session = "session";
const line = (row: object) => Buffer.from(`${JSON.stringify({ session_id: session, ...row })}\n`);
test("a checkpoint preserves split UTF-8 and a partial JSON line across restart", () => {
	const bytes = line({ type: "assistant", uuid: "assistant", message: { content: [{ type: "text", text: "A𝄞B" }] } });
	const split = bytes.indexOf(Buffer.from("𝄞")) + 2;
	const first = new ClaudeStream(session);
	first.feed(bytes.subarray(0, split));
	const resumed = new ClaudeStream(session, undefined, {
		snapshot: first.snapshot(),
		checkpoint: first.checkpoint(split),
	});
	resumed.feed(bytes.subarray(split));
	expect(resumed.snapshot().transcript[0]?.text).toBe("A𝄞B");
	expect(resumed.checkpoint(bytes.length).pendingBytes).toBe("");
});
test("transcript and in-memory receipts remain bounded while final result stays separate", () => {
	const parser = new ClaudeStream(session);
	for (let i = 0; i < 160; i++)
		parser.feed(
			line({
				type: "user",
				uuid: `message-${i}`,
				isReplay: true,
				message: { role: "user", content: "x".repeat(10000) },
			}),
		);
	parser.feed(
		line({ type: "result", subtype: "success", uuid: "final", is_error: false, result: "retained final result" }),
	);
	expect(parser.snapshot().acknowledgedMessageIds.length).toBe(128);
	expect(parser.snapshot().acknowledgedMessageIds.at(-1)).toBe("message-159");
	expect(
		parser.snapshot().transcript.reduce((n, message) => n + Buffer.byteLength(message.text), 0),
	).toBeLessThanOrEqual(512 * 1024);
	expect(parser.snapshot().transcriptTruncated).toBe(true);
	expect(parser.snapshot().resultId).toBe("final");
	expect(parser.snapshot().result).toBe("retained final result");
});
test("an oversized result exposes truncation and preserves its identity", () => {
	const parser = new ClaudeStream(session);
	parser.feed(
		line({ type: "result", subtype: "success", uuid: "large-result", is_error: false, result: "é".repeat(400000) }),
	);
	expect(Buffer.byteLength(parser.snapshot().result!)).toBeLessThanOrEqual(512 * 1024);
	expect(parser.snapshot().resultTruncated).toBe(true);
	expect(parser.snapshot().resultId).toBe("large-result");
});
test("a complete oversized JSON record cannot bypass the record limit", () => {
	const parser = new ClaudeStream("session");
	parser.feed(
		Buffer.from(
			`${JSON.stringify({ type: "result", session_id: "session", subtype: "success", result: "x".repeat(2_000_000) })}\n`,
		),
	);
	expect(parser.snapshot().state).toBe("unknown");
	expect(parser.snapshot().error).toContain("byte limit");
});
