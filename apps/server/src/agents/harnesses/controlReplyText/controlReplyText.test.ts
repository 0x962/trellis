import { expect, test } from "bun:test";
import { controlReplyText } from "./controlReplyText.ts";

test("a known Codex refusal reads as a sentence and keeps its code", () => {
	expect(controlReplyText("codex", 409, '{"error":"STALE_TURN"}')).toEqual({
		message: "Codex finished that turn. Read the current turn before another interrupt.",
		code: "STALE_TURN",
	});
	expect(controlReplyText("codex", 409, '{"error":"CONTROL_PENDING"}')).toEqual({
		message: "Codex is still handling the previous control request. Wait for it to finish.",
		code: "CONTROL_PENDING",
	});
	expect(controlReplyText("codex", 409, '{"error":"STALE_SESSION"}')).toEqual({
		message: "The Codex session changed. Read the current session before a resend.",
		code: "STALE_SESSION",
	});
	expect(controlReplyText("codex", 401, '{"error":"Unauthorized"}')).toEqual({
		message: "The Codex control token does not match this session.",
		code: "Unauthorized",
	});
	expect(controlReplyText("codex", 404, '{"error":"Not found"}')).toEqual({
		message: "The Codex control path does not exist.",
		code: "Not found",
	});
	expect(controlReplyText("codex", 413, '{"error":"Request too large"}')).toEqual({
		message: "The message exceeds the 1 MiB Codex control limit.",
		code: "Request too large",
	});
});

// The 500 reply carries the message of whatever threw inside the control
// server. That text is unknown, so the sentence names Codex and quotes it.
test("an unknown Codex error message reads as a quote and carries no code", () => {
	expect(controlReplyText("codex", 500, '{"error":"turn/start failed"}')).toEqual({
		message: "Codex reported: turn/start failed",
		code: null,
	});
});

test("a body that is not JSON reads as the status and the raw text", () => {
	expect(controlReplyText("codex", 502, "<html>bad gateway</html>")).toEqual({
		message: "Codex answered HTTP 502: <html>bad gateway</html>",
		code: null,
	});
	expect(controlReplyText("opencode", 500, "")).toEqual({ message: "OpenCode answered HTTP 500: ", code: null });
});

test("a known OpenCode refusal reads as a sentence and keeps its code", () => {
	expect(controlReplyText("opencode", 409, '{"error":"STALE_TURN"}')).toEqual({
		message: "OpenCode finished that turn. Read the current turn before another interrupt.",
		code: "STALE_TURN",
	});
	expect(controlReplyText("opencode", 409, '{"error":"INTERRUPT_PENDING"}')).toEqual({
		message: "OpenCode is still handling the previous interrupt. Wait for it to finish.",
		code: "INTERRUPT_PENDING",
	});
	expect(controlReplyText("opencode", 409, '{"error":"INTERRUPT_ALREADY_REQUESTED"}')).toEqual({
		message: "OpenCode already has an interrupt for that turn. Wait for the turn to stop.",
		code: "INTERRUPT_ALREADY_REQUESTED",
	});
	expect(controlReplyText("opencode", 409, '{"error":"STALE_SESSION"}')).toEqual({
		message: "The OpenCode session changed. Read the current session before a resend.",
		code: "STALE_SESSION",
	});
	expect(controlReplyText("opencode", 401, '{"error":"Unauthorized"}')).toEqual({
		message: "The OpenCode control token does not match this session.",
		code: "Unauthorized",
	});
	expect(controlReplyText("opencode", 413, '{"error":"Request too large"}')).toEqual({
		message: "The message exceeds the 1 MiB OpenCode control limit.",
		code: "Request too large",
	});
});

// The code of one harness never reaches the sentences of the other harness.
test("a Codex code is no OpenCode code", () => {
	expect(controlReplyText("codex", 409, '{"error":"INTERRUPT_PENDING"}')).toEqual({
		message: "Codex reported: INTERRUPT_PENDING",
		code: null,
	});
});
