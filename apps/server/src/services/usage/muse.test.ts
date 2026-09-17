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

const record = (payloadType: string, payload: unknown, recordedAt = 1789594157161904) => ({
	stream: { kind: "session", id: "01a0ac1f-be03-7753-8bc0-ec2b98901115" },
	recorded_at: recordedAt,
	payload_type: payloadType,
	payload,
});
const lines = (...values: unknown[]) => `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;

test("a Muse session yields one entry per model call, with its model, directory, and prompt", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-usage-muse-"));
	dirs.push(root);
	const dir = join(root, "2026", "09", "16", "01a0ac1f-be03-7753-8bc0-ec2b98901115");
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "session.jsonl"),
		lines(
			// A frame holds several records as JSON text.
			{
				retained_frame: "session_permission_transaction",
				children: [
					{
						child_index: 0,
						record_json: JSON.stringify(
							record("runtime.session.metadata", {
								kind: "metadata",
								record: { workspace_root: "/repo", provider_id: "meta" },
							}),
						),
					},
				],
			},
			record("run.model.configured", { kind: "run_model", record: { model_id: "muse-spark-1.3-contributor" } }),
			record("runtime.command_intake.received", {
				kind: "command_intake",
				record: { kind: "received", command: { kind: "turn_submit", prompt: "Fix the flaky test" } },
			}),
			record("runtime.session", {
				kind: "run",
				event: {
					kind: "model_completed",
					usage: { input_tokens: 1200, output_tokens: 300, cached_tokens: 1000, reasoning_tokens: 50 },
				},
			}),
			record("runtime.session", {
				kind: "run",
				event: { kind: "resource_usage_sampled", usage: { rss_self_bytes: 1 } },
			}),
		),
	);
	const out: UsageLogEntry[] = [];
	const labels = new Map<string, string>();
	const scanned = await collectMuseEntries(root, 7, 0, out, labels);
	expect(scanned).toBe(1);
	expect(out).toEqual([
		{
			harness: "muse",
			model: "muse-spark-1.3-contributor",
			timestampMs: 1789594157161,
			cwd: "/repo",
			sessionId: "01a0ac1f-be03-7753-8bc0-ec2b98901115",
			uncachedInput: 200,
			cachedInput: 1000,
			cacheWrite5m: 0,
			cacheWrite1h: 0,
			output: 300,
			reasoningOutput: 50,
		},
	]);
	expect(labels.get("01a0ac1f-be03-7753-8bc0-ec2b98901115")).toBe("Fix the flaky test");
});

test("a session on the echo provider is a local test and adds nothing", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-usage-muse-"));
	dirs.push(root);
	const dir = join(root, "2026", "09", "16", "echo-session");
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "session.jsonl"),
		lines(
			record("runtime.session.metadata", {
				kind: "metadata",
				record: { workspace_root: "/repo", provider_id: "echo" },
			}),
			record("runtime.session", {
				kind: "run",
				event: { kind: "model_completed", usage: { input_tokens: 5, output_tokens: 5 } },
			}),
		),
	);
	const out: UsageLogEntry[] = [];
	await collectMuseEntries(root, 7, 0, out, new Map());
	expect(out).toEqual([]);
});
