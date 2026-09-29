import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readObserverTranscriptUsage } from "./readAttemptUsage.ts";

const directory = await mkdtemp(join(tmpdir(), "trellis-observer-usage-"));
afterAll(() => rm(directory, { recursive: true, force: true }));
const input = { attemptId: "attempt", providerSessionId: "observer", text: "A complete account." };
const user = { type: "user", sessionId: "observer", message: { content: "trellis-message:attempt\nContext" } };
const assistant = (output: number, stop = "end_turn") => ({
	type: "assistant",
	sessionId: "observer",
	timestamp: new Date().toISOString(),
	requestId: "request",
	message: {
		id: "message",
		model: "claude-sonnet-5-5",
		stop_reason: stop,
		content: [{ type: "text", text: input.text }],
		usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: output },
	},
});
async function transcript(records: unknown[]) {
	const path = join(directory, "observer.jsonl");
	await writeFile(path, `${records.map((row) => JSON.stringify(row)).join("\n")}\n`);
	return path;
}

test("returns one final usage record per Claude request and excludes older turns", async () => {
	const old = { ...assistant(999), requestId: "old" };
	const path = await transcript([old, user, assistant(1, ""), assistant(40)]);
	expect(await readObserverTranscriptUsage(path, input)).toEqual({
		source: "claude-transcript",
		requests: [
			{
				messageId: "message",
				requestId: "request",
				uncachedInput: 10,
				cachedInput: 20,
				cacheWrite5m: 30,
				cacheWrite1h: 0,
				output: 40,
				reasoningOutput: 0,
			},
		],
	});
});

test.each(["max_tokens", "tool_use", ""])("does not treat %s as a complete answer", async (stop) => {
	await expect(readObserverTranscriptUsage(await transcript([user, assistant(40, stop)]), input)).rejects.toMatchObject(
		{ code: "OBSERVER_REPLY_INCOMPLETE" },
	);
});

test("requires the exact prompt and response", async () => {
	const path = await transcript([user, assistant(40)]);
	await expect(readObserverTranscriptUsage(path, { ...input, attemptId: "other" })).rejects.toThrow();
	await expect(readObserverTranscriptUsage(path, { ...input, text: "Old answer" })).rejects.toThrow();
});

test.each([
	{},
	{ input_tokens: 10 },
	{ output_tokens: 10 },
	{ input_tokens: null, output_tokens: 10 },
	{ input_tokens: "10", output_tokens: 10 },
	{ input_tokens: -1, output_tokens: 10 },
	{ input_tokens: 1.5, output_tokens: 10 },
	{ input_tokens: 10, output_tokens: null },
	{ input_tokens: 10, output_tokens: "10" },
	{ input_tokens: 10, output_tokens: -1 },
	{ input_tokens: 10, output_tokens: 1.5 },
	{ input_tokens: 1e100, output_tokens: 10 },
	{ input_tokens: 10, output_tokens: 1e100 },
])("rejects missing or invalid required counts: %j", async (usage) => {
	const row = assistant(40);
	const record = { ...row, message: { ...row.message, usage } };
	await expect(readObserverTranscriptUsage(await transcript([user, record]), input)).rejects.toMatchObject({
		code: "OBSERVER_USAGE_UNAVAILABLE",
	});
});

test("preserves recorded zero counts and absent optional counts", async () => {
	const row = assistant(0);
	const record = { ...row, message: { ...row.message, usage: { input_tokens: 0, output_tokens: 0 } } };
	const result = await readObserverTranscriptUsage(await transcript([user, record]), input);
	expect(result.requests[0]).toMatchObject({
		uncachedInput: 0,
		output: 0,
		cachedInput: 0,
		cacheWrite5m: 0,
		cacheWrite1h: 0,
		reasoningOutput: 0,
	});
});
