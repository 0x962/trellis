import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tempDirs } from "../../tempDir.ts";
import { collectMuseEntries } from "./muse.ts";

const tempDir = tempDirs();

describe("Muse usage logs", () => {
	test("uses the current queued turn prompt as the session label", async () => {
		const root = await tempDir("trellis-usage-muse-");
		const sessionId = "019cfe62-5d41-7dda-8efe-cf8ec7958868";
		const session = join(root, "sessions", "2026", "09", "17", sessionId);
		await mkdir(session, { recursive: true });
		const recordedAt = Date.now() * 1000;
		await writeFile(
			join(session, "session.jsonl"),
			[
				{
					stream: { id: sessionId },
					payload_type: "runtime.command_intake.received",
					payload: {
						record: { command: { kind: "turn_queue_submit", payload: { prompt: "Audit the usage report" } } },
					},
				},
				{
					stream: { id: sessionId },
					recorded_at: recordedAt,
					payload_type: "runtime.session",
					payload: {
						event: {
							kind: "model_completed",
							usage: { input_tokens: 100, cached_tokens: 80, output_tokens: 20, reasoning_tokens: 5 },
						},
					},
				},
			]
				.map((record) => JSON.stringify(record))
				.join("\n"),
		);

		const entries: Parameters<typeof collectMuseEntries>[3] = [];
		const labels = new Map<string, string>();
		expect(await collectMuseEntries(root, 1, Date.now() - 60_000, entries, labels)).toBe(1);
		expect(labels.get(sessionId)).toBe("Audit the usage report");
		expect(entries).toEqual([
			expect.objectContaining({
				sessionId,
				uncachedInput: 20,
				cachedInput: 80,
				output: 20,
				reasoningOutput: 5,
			}),
		]);
	});
});
