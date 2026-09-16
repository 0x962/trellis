// The Codex, OpenCode, and Muse control sockets answer a refused prompt or a
// refused interrupt with a JSON body, such as `{"error":"STALE_TURN"}`. A person sees
// that body in a toast when a send or an interrupt fails. This module turns one
// body into a sentence.
//
// `message` is the sentence to show. `code` is the machine word of a known
// refusal, such as `STALE_TURN`, and it is null for every other body. A caller
// puts `code` on the Error it throws, so a later caller can branch on the
// refusal and never has to match the sentence.

export type ControlHarness = "codex" | "opencode" | "muse";

export type ControlReply = { message: string; code: string | null };

const names: Record<ControlHarness, string> = { codex: "Codex", opencode: "OpenCode", muse: "Muse" };

// One sentence for each value a control socket puts in the `error` field. The
// keys come from codex/codexControl.ts, opencode/control.mjs, and
// muse/museControl.ts.
const sentences: Record<ControlHarness, Record<string, string>> = {
	codex: {
		STALE_TURN: "Codex finished that turn. Read the current turn before another interrupt.",
		CONTROL_PENDING: "Codex is still handling the previous control request. Wait for it to finish.",
		STALE_SESSION: "The Codex session changed. Read the current session before a resend.",
		Unauthorized: "The Codex control token does not match this session.",
		"Not found": "The Codex control path does not exist.",
		"Request too large": "The message exceeds the 1 MiB Codex control limit.",
	},
	opencode: {
		STALE_TURN: "OpenCode finished that turn. Read the current turn before another interrupt.",
		CONTROL_PENDING: "OpenCode is still handling the previous control request. Wait for it to finish.",
		INTERRUPT_PENDING: "OpenCode is still handling the previous interrupt. Wait for it to finish.",
		INTERRUPT_ALREADY_REQUESTED: "OpenCode already has an interrupt for that turn. Wait for the turn to stop.",
		STALE_SESSION: "The OpenCode session changed. Read the current session before a resend.",
		Unauthorized: "The OpenCode control token does not match this session.",
		"Not found": "The OpenCode control path does not exist.",
		"Request too large": "The message exceeds the 1 MiB OpenCode control limit.",
	},
	muse: {
		STALE_TURN: "Muse finished that turn. Read the current turn before another interrupt.",
		CONTROL_PENDING: "Muse is still handling the previous control request. Wait for it to finish.",
		STALE_SESSION: "The Muse session changed. Read the current session before a resend.",
		Unauthorized: "The Muse control token does not match this session.",
		"Not found": "The Muse control path does not exist.",
		"Request too large": "The message exceeds the 1 MiB Muse control limit.",
	},
};

// The `error` field of the body, or null when the body is not JSON that holds
// a string in that field. The body comes from another process, so it can hold
// anything.
const errorField = (body: string): string | null => {
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		return null;
	}
	const error = (value as { error?: unknown } | null)?.error;
	return typeof error === "string" ? error : null;
};

export function controlReplyText(harness: ControlHarness, status: number, body: string): ControlReply {
	const name = names[harness];
	const error = errorField(body);
	if (error === null) return { message: `${name} answered HTTP ${status}: ${body}`, code: null };
	const sentence = sentences[harness][error];
	if (sentence === undefined) return { message: `${name} reported: ${error}`, code: null };
	return { message: sentence, code: error };
}
