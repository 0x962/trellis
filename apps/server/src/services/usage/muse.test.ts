import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectMuseEntries } from "./muse.ts";
import type { UsageLogEntry } from "./parse.ts";

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const lines = (...values: unknown[]) => `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;

test("Muse counts each completed model call with its cached share, model, cwd, and first prompt", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-usage-muse-"));
	dirs.push(root);
	const sessionId = "01a0ac20-9e77-7270-8acc-36ec0dd2b6e8";
	const dir = join(root, "2026", "09", "16", sessionId);
	await mkdir(dir, { recursive: true });
	const stream = { kind: "session", id: sessionId };
	const at = Date.UTC(2026, 8, 16, 21, 30, 0) * 1000;
	await writeFile(
		join(dir, "session.jsonl"),
		lines(
			{
				stream,
				payload_type: "runtime.session.metadata",
				payload: { kind: "metadata", record: { workspace_root: "/work/repo", model_id: "muse-spark-1.3" } },
			},
			{
				stream,
				payload_type: "runtime.user_intent.accepted",
				payload: { refill_blocks: [{ kind: "text", text: "Run pwd, then reply ok." }] },
			},
			{
				stream,
				recorded_at: at,
				payload_type: "runtime.session",
				payload: {
					kind: "run",
					event: {
						kind: "model_completed",
						usage: {
							input_tokens: 25944,
							output_tokens: 89,
							cached_tokens: 1000,
							cache_write_tokens: 0,
							cache_read_tokens: 1000,
							reasoning_tokens: 8,
						},
						model: "muse-spark-1.3",
					},
				},
			},
			{
				stream,
				recorded_at: at,
				payload_type: "runtime.session",
				payload: { kind: "run", event: { kind: "resource_usage_sampled", usage: { rss_self_bytes: 1 } } },
			},
			{
				stream,
				recorded_at: at - 40 * 24 * 60 * 60 * 1000 * 1000,
				payload_type: "runtime.session",
				payload: {
					kind: "run",
					event: { kind: "model_completed", usage: { input_tokens: 5, output_tokens: 5 }, model: "muse-spark-1.3" },
				},
			},
		),
	);
	await writeFile(join(dir, "cli-abc.log"), "not a session log\n");
	const out: UsageLogEntry[] = [];
	const labels = new Map<string, string>();
	const scanned = await collectMuseEntries(root, 30, Date.UTC(2026, 8, 1), out, labels);
	expect(scanned).toBe(1);
	expect(out).toEqual([
		{
			harness: "muse",
			model: "muse-spark-1.3",
			timestampMs: Date.UTC(2026, 8, 16, 21, 30, 0),
			cwd: "/work/repo",
			sessionId,
			uncachedInput: 24944,
			cachedInput: 1000,
			cacheWrite5m: 0,
			cacheWrite1h: 0,
			output: 89,
			reasoningOutput: 8,
		},
	]);
	expect(labels.get(sessionId)).toBe("Run pwd, then reply ok.");
});
