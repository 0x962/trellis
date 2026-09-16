// Muse writes one directory per session under `<data>/muse/sessions/<year>/
// <month>/<day>/<session id>/`, with the durable log in `session.jsonl`.
// Each line is an envelope with a `payload_type`. A `runtime.session` line
// whose run event is `model_completed` holds the tokens of one model call
// and the model that answered. The first `runtime.user_intent.accepted`
// line holds the first prompt. `runtime.session.metadata` names the
// workspace. `recorded_at` counts microseconds since the epoch.

import { basename, dirname } from "node:path";
import type { LogFile } from "./logs.ts";
import { collectLogFiles } from "./logs.ts";
import type { UsageLogEntry } from "./parse.ts";
import { forEachLine, num, toSessionLabel } from "./parse.ts";

type MuseLine = {
	stream?: { id?: string };
	recorded_at?: number;
	payload_type?: string;
	payload?: {
		kind?: string;
		record?: { workspace_root?: string };
		refill_blocks?: Array<{ kind?: string; text?: string }>;
		event?: {
			kind?: string;
			model?: string;
			usage?: {
				input_tokens?: number;
				output_tokens?: number;
				cached_tokens?: number;
				cache_write_tokens?: number;
				cache_read_tokens?: number;
				reasoning_tokens?: number;
			};
		};
	};
};

async function parseMuseLogFile(
	file: LogFile,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<void> {
	let sessionId = basename(dirname(file.path));
	let cwd: string | null = null;
	await forEachLine(file.path, (line) => {
		const usage = line.includes('"model_completed"');
		const metadata = line.includes('"runtime.session.metadata"');
		const intent = line.includes('"runtime.user_intent.accepted"');
		if (!usage && !metadata && !intent) return;
		let parsed: MuseLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (typeof parsed.stream?.id === "string") sessionId = parsed.stream.id;
		if (parsed.payload_type === "runtime.session.metadata") {
			const root = parsed.payload?.record?.workspace_root;
			if (typeof root === "string") cwd = root;
			return;
		}
		if (parsed.payload_type === "runtime.user_intent.accepted") {
			if (!sessionLabels.has(sessionId)) {
				const label = toSessionLabel(parsed.payload?.refill_blocks?.find((block) => block.kind === "text")?.text);
				if (label) sessionLabels.set(sessionId, label);
			}
			return;
		}
		const event = parsed.payload?.event;
		if (parsed.payload_type !== "runtime.session" || event?.kind !== "model_completed" || !event.usage) return;
		const timestampMs =
			typeof parsed.recorded_at === "number" && parsed.recorded_at > 0
				? Math.floor(parsed.recorded_at / 1000)
				: file.mtimeMs;
		if (timestampMs < cutoffMs) return;
		const tokens = event.usage;
		// The cached count of a Muse call is a part of its input count, and
		// the cache read count repeats the cached count.
		const cached = Math.max(num(tokens.cached_tokens), num(tokens.cache_read_tokens));
		out.push({
			harness: "muse",
			model: event.model ?? "unknown",
			timestampMs,
			cwd,
			sessionId,
			uncachedInput: Math.max(0, num(tokens.input_tokens) - cached),
			cachedInput: cached,
			cacheWrite5m: num(tokens.cache_write_tokens),
			cacheWrite1h: 0,
			output: num(tokens.output_tokens),
			reasoningOutput: num(tokens.reasoning_tokens),
		});
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
