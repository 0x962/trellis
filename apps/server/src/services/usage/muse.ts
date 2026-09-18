// Muse, the Meta coding agent, keeps one directory per session under
// `<data>/muse/sessions/<year>/<month>/<day>/<session id>/`, with the
// transcript in `session.jsonl`. Every line is one event record, or a
// frame whose `children` hold several records as JSON text. The events the
// scan reads:
// - `runtime.session.metadata`: the working directory and the provider.
// - `run.model.configured`: the model of the runs that follow.
// - `runtime.session` with `event.kind === "model_completed"`: the tokens of
//   one model call. `input_tokens` includes `cached_tokens`.
// - `runtime.command_intake.received` with a turn command: a prompt.
// A session on the `echo` provider is a local test with no model, so it
// adds nothing.

import { basename } from "node:path";
import type { LogFile } from "./logs.ts";
import { collectLogFiles } from "./logs.ts";
import type { UsageLogEntry } from "./parse.ts";
import { forEachLine, num, toSessionLabel } from "./parse.ts";

type MuseRecord = {
	stream?: { id?: string };
	recorded_at?: number;
	payload_type?: string;
	payload?: {
		kind?: string;
		record?: {
			workspace_root?: string;
			provider_id?: string;
			model_id?: string;
			command?: { kind?: string; prompt?: string; payload?: { prompt?: string } };
		};
		event?: {
			kind?: string;
			usage?: { input_tokens?: number; output_tokens?: number; cached_tokens?: number; reasoning_tokens?: number };
		};
	};
	children?: Array<{ record_json?: string }>;
};

// Muse records time in microseconds since the epoch.
const toMs = (recordedAt: number | undefined, mtimeMs: number) =>
	typeof recordedAt === "number" && recordedAt > 0 ? Math.floor(recordedAt / 1000) : mtimeMs;

async function parseMuseLogFile(
	file: LogFile,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<void> {
	let sessionId = basename(file.path.slice(0, -"/session.jsonl".length));
	let cwd: string | null = null;
	let provider: string | null = null;
	let model = "unknown";
	const apply = (record: MuseRecord) => {
		if (typeof record.stream?.id === "string") sessionId = record.stream.id;
		const payload = record.payload;
		if (!payload) return;
		if (record.payload_type === "runtime.session.metadata") {
			if (typeof payload.record?.workspace_root === "string") cwd = payload.record.workspace_root;
			if (typeof payload.record?.provider_id === "string") provider = payload.record.provider_id;
			return;
		}
		if (record.payload_type === "run.model.configured") {
			if (payload.record?.model_id) model = payload.record.model_id;
			return;
		}
		if (record.payload_type === "runtime.command_intake.received") {
			const command = payload.record?.command;
			if (["turn_submit", "turn_queue_submit"].includes(command?.kind ?? "") && !sessionLabels.has(sessionId)) {
				const label = toSessionLabel(command?.payload?.prompt ?? command?.prompt);
				if (label) sessionLabels.set(sessionId, label);
			}
			return;
		}
		if (record.payload_type !== "runtime.session" || payload.event?.kind !== "model_completed") return;
		if (provider === "echo") return;
		const usage = payload.event.usage;
		if (!usage) return;
		const timestampMs = toMs(record.recorded_at, file.mtimeMs);
		if (timestampMs < cutoffMs) return;
		const input = num(usage.input_tokens);
		const cached = num(usage.cached_tokens);
		out.push({
			harness: "muse",
			model,
			timestampMs,
			cwd,
			sessionId,
			uncachedInput: Math.max(0, input - cached),
			cachedInput: cached,
			cacheWrite5m: 0,
			cacheWrite1h: 0,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.reasoning_tokens),
		});
	};
	await forEachLine(file.path, (line) => {
		if (
			!line.includes("model_completed") &&
			!line.includes("runtime.session.metadata") &&
			!line.includes("run.model.configured") &&
			!line.includes("turn_submit") &&
			!line.includes("turn_queue_submit")
		)
			return;
		let parsed: MuseRecord;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (parsed.children) {
			for (const child of parsed.children) {
				if (typeof child.record_json !== "string") continue;
				try {
					apply(JSON.parse(child.record_json));
				} catch {
					// A frame with a broken child stays out of the count.
				}
			}
			return;
		}
		apply(parsed);
	});
}

// Returns the number of session files it read.
export async function collectMuseEntries(
	root: string,
	days: number,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<number> {
	const files = (await collectLogFiles(root, days + 1)).filter((file) => basename(file.path) === "session.jsonl");
	for (const file of files) await parseMuseLogFile(file, cutoffMs, out, sessionLabels);
	return files.length;
}
