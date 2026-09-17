import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UsageLogEntry } from "./parse.ts";
import { LABEL_ATTEMPTS, parseClaudeLogFile, parseCodexLogFile, toSessionLabel, wantsLabel } from "./parse.ts";

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const scratch = async () => {
	const dir = await mkdtemp(join(tmpdir(), "trellis-usage-parse-"));
	dirs.push(dir);
	return dir;
};
const lines = (...values: unknown[]) => `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;

test("Claude keeps the last usage line per message and request", async () => {
	const dir = await scratch();
	const path = join(dir, "abc-123.jsonl");
	const assistant = (output: number) => ({
		type: "assistant",
		requestId: "req_1",
		timestamp: "2026-09-16T10:00:00.000Z",
		cwd: "/work/repo",
		message: {
			id: "msg_1",
			model: "claude-fable-5-1",
			usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 5 },
		},
	});
	await writeFile(
		path,
		lines({ type: "user", message: { role: "user", content: "Fix the login bug" } }, assistant(1), assistant(40), {
			type: "assistant",
			message: { model: "<synthetic>", usage: { output_tokens: 9 } },
		}),
	);
	const byMessage = new Map<string, UsageLogEntry>();
	const out: UsageLogEntry[] = [];
	const labels = new Map<string, string>();
	await parseClaudeLogFile({ path, mtimeMs: Date.now() }, byMessage, 0, out, labels);
	expect(out).toEqual([]);
	expect([...byMessage.values()]).toEqual([
		{
			harness: "claude",
			model: "claude-fable-5-1",
			timestampMs: Date.parse("2026-09-16T10:00:00.000Z"),
			cwd: "/work/repo",
			sessionId: "abc-123",
			uncachedInput: 10,
			cachedInput: 100,
			cacheWrite5m: 5,
			cacheWrite1h: 0,
			output: 40,
			reasoningOutput: 0,
		},
	]);
	expect(labels.get("abc-123")).toBe("Fix the login bug");
});

test("Claude drops a turn before the cutoff", async () => {
	const dir = await scratch();
	const path = join(dir, "old.jsonl");
	await writeFile(
		path,
		lines({
			type: "assistant",
			requestId: "r",
			timestamp: "2026-01-01T00:00:00.000Z",
			message: { id: "m", model: "claude-sonnet-5", usage: { input_tokens: 1, output_tokens: 1 } },
		}),
	);
	const byMessage = new Map<string, UsageLogEntry>();
	await parseClaudeLogFile(
		{ path, mtimeMs: Date.now() },
		byMessage,
		Date.parse("2026-09-01T00:00:00.000Z"),
		[],
		new Map(),
	);
	expect(byMessage.size).toBe(0);
});

test("Codex takes the thread id from session_meta, carries the model and cwd, and skips a repeated delta", async () => {
	const dir = await scratch();
	const path = join(dir, "rollout-2026-09-16T12-38-03-thread.jsonl");
	const count = (input: number, cached: number, output: number) => ({
		timestamp: "2026-09-16T12:40:00.000Z",
		type: "event_msg",
		payload: {
			type: "token_count",
			info: { last_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } },
		},
	});
	await writeFile(
		path,
		lines(
			{ type: "session_meta", payload: { id: "thread-9", cwd: "/home/agents/run/work" } },
			{ type: "turn_context", payload: { model: "gpt-5.3-codex" } },
			{ type: "event_msg", payload: { type: "user_message", message: "Write the tests" } },
			count(1000, 900, 50),
			count(1000, 900, 50),
			count(1200, 1100, 20),
		),
	);
	const out: UsageLogEntry[] = [];
	const labels = new Map<string, string>();
	await parseCodexLogFile({ path, mtimeMs: Date.now() }, 0, out, labels);
	expect(
		out.map((entry) => [entry.sessionId, entry.model, entry.cwd, entry.uncachedInput, entry.cachedInput, entry.output]),
	).toEqual([
		["thread-9", "gpt-5.3-codex", "/home/agents/run/work", 100, 900, 50],
		["thread-9", "gpt-5.3-codex", "/home/agents/run/work", 100, 1100, 20],
	]);
	expect(labels.get("thread-9")).toBe("Write the tests");
});

test("a session label is the first plain line of the prompt", () => {
	expect(toSessionLabel("<system-reminder>x</system-reminder>")).toBeNull();
	expect(toSessionLabel("Caveat: the messages below")).toBeNull();
	expect(toSessionLabel("  Ship it\nmore")).toBe("Ship it");
	expect(toSessionLabel("a".repeat(100))).toHaveLength(80);
});

test("a session gets a bounded number of label attempts, and none once it has a label", () => {
	const labels = new Map<string, string>();
	const attempts = new Map<string, number>();
	for (let i = 0; i < LABEL_ATTEMPTS; i++) expect(wantsLabel("s", labels, attempts)).toBe(true);
	expect(wantsLabel("s", labels, attempts)).toBe(false);
	labels.set("t", "Fix it");
	expect(wantsLabel("t", labels, attempts)).toBe(false);
});
