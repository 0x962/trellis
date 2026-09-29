import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tempDirs } from "../../tempDir.ts";
import { forEachLine, parseClaudeLogFile } from "./parse.ts";

const tempDir = tempDirs();

describe("Claude usage log parsing", () => {
	test("counts a complete event above 32 MiB", async () => {
		const root = await tempDir("trellis-usage-parse-");
		const path = join(root, "large-session.jsonl");
		const event = {
			type: "assistant",
			timestamp: "2026-09-29T06:00:00.000Z",
			cwd: "/synthetic/work",
			message: {
				model: "claude-synthetic",
				content: "x".repeat(32 * 1024 * 1024),
				usage: {
					input_tokens: 101,
					cache_read_input_tokens: 202,
					cache_creation_input_tokens: 303,
					output_tokens: 404,
					output_tokens_details: { thinking_tokens: 55 },
				},
			},
		};
		await writeFile(path, `${JSON.stringify(event)}\n`);

		const entries: Parameters<typeof parseClaudeLogFile>[3] = [];
		await parseClaudeLogFile(
			{ path, mtimeMs: Date.parse("2026-09-29T06:00:00.000Z") },
			new Map(),
			0,
			entries,
			new Map(),
		);

		expect(entries).toEqual([
			{
				harness: "claude",
				model: "claude-synthetic",
				timestampMs: Date.parse("2026-09-29T06:00:00.000Z"),
				cwd: "/synthetic/work",
				sessionId: "large-session",
				uncachedInput: 101,
				cachedInput: 202,
				cacheWrite5m: 303,
				cacheWrite1h: 0,
				output: 404,
				reasoningOutput: 55,
			},
		]);
	});

	test("uses a complete late label and ignores malformed events", async () => {
		const root = await tempDir("trellis-usage-parse-");
		const path = join(root, "late-label.jsonl");
		const ignoredCandidates = Array.from({ length: 8 }, (_, index) =>
			JSON.stringify({ type: "user", isMeta: true, message: { content: `metadata ${index}` } }),
		);
		const label = `Late prompt ${"l".repeat(17 * 1024)}`;
		const validEvent = JSON.stringify({
			type: "assistant",
			timestamp: "2026-09-29T06:30:00.000Z",
			message: {
				model: "claude-synthetic",
				usage: { input_tokens: 7, output_tokens: 11 },
			},
		});
		await writeFile(
			path,
			[
				...ignoredCandidates,
				JSON.stringify({ type: "user", message: { content: label } }),
				'{"type":"assistant","message":{"model":"claude-synthetic","usage":{"input_tokens":999}',
				validEvent,
			].join("\n"),
		);

		const entries: Parameters<typeof parseClaudeLogFile>[3] = [];
		const labels = new Map<string, string>();
		await parseClaudeLogFile({ path, mtimeMs: Date.parse("2026-09-29T06:30:00.000Z") }, new Map(), 0, entries, labels);

		expect(labels.get("late-label")).toBe(label);
		expect(entries).toEqual([
			expect.objectContaining({
				uncachedInput: 7,
				cachedInput: 0,
				output: 11,
			}),
		]);
	});
});

describe("forEachLine", () => {
	test("returns when the file is missing", async () => {
		const root = await tempDir("trellis-usage-parse-");
		const lines: string[] = [];

		await forEachLine(join(root, "missing.jsonl"), (line) => lines.push(line));

		expect(lines).toEqual([]);
	});

	test("propagates an error from the callback", async () => {
		const root = await tempDir("trellis-usage-parse-");
		const path = join(root, "callback.jsonl");
		const callbackError = new Error("callback failed");
		await writeFile(path, "first\nsecond\n");

		await expect(
			forEachLine(path, () => {
				throw callbackError;
			}),
		).rejects.toBe(callbackError);
	});
});
