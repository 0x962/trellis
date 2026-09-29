// Streaming parsers for the transcript files that Claude Code and Codex
// write. These are the same files that ccusage reads, so the report covers
// every turn on the machine, not only the turns Trellis started.
//
// Rules that keep the counts exact:
// - Claude: count only `type === "assistant"` lines with usage, and keep the
//   last line per `message.id + requestId`. A resume, a fork, and a
//   compaction rewrite the same message into several files, and Claude Code
//   writes one line per content block with a usage snapshot that grows as
//   the response streams. Only the last line carries the complete usage.
// - Codex: read `payload.info.last_token_usage`, the per-turn delta, and
//   never `total_token_usage`, the cumulative counter. The model and the cwd
//   ride on `turn_context` and `session_meta` events and carry forward.
//   `input_tokens` includes the cached tokens.
// - Reasoning tokens are a subset of output tokens and never add on top.

import { createReadStream } from "node:fs";
import { basename } from "node:path";
import type { UsageHarness } from "@trellis/api";
import type { LogFile } from "./logs.ts";

export type UsageLogEntry = {
	harness: UsageHarness;
	model: string;
	timestampMs: number;
	cwd: string | null;
	// The provider session identifier. Trellis stores the same value in
	// `agent_runs.session_id` when it starts the agent, so the join is exact.
	sessionId: string;
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;
	reasoningOutput: number;
	// The cost the harness recorded itself, in USD. Pi and OpenCode record
	// one. When present it replaces the API list rate estimate.
	costUsd?: number;
};

export function sessionIdForFile(path: string): string {
	return basename(path).replace(/\.jsonl$/, "");
}

// The first real user prompt of a session. A slash command, a caveat, and a
// system reminder wrapper do not count. A multiline prompt uses its first line.
export function toSessionLabel(text: unknown): string | null {
	if (typeof text !== "string") return null;
	const trimmed = text.trim();
	if (!trimmed || trimmed.startsWith("<") || trimmed.startsWith("#") || trimmed.startsWith("Caveat:")) return null;
	const line = trimmed.split("\n", 1)[0] ?? "";
	if (!line) return null;
	return line;
}

// Calls `onLine` for every `\n`-terminated line of a UTF-8 file, with a
// trailing `\r` removed. The stream retains only the parts of the current
// line, because JSON.parse needs one complete transcript record.
export async function forEachLine(path: string, onLine: (line: string) => void): Promise<void> {
	let parts: string[] = [];
	const emit = (tail: string) => {
		parts.push(tail);
		const raw = parts.join("");
		parts = [];
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		onLine(line);
	};
	const stream = createReadStream(path, { encoding: "utf-8" });
	const iterator = (stream as AsyncIterable<string>)[Symbol.asyncIterator]();
	try {
		while (true) {
			let next: IteratorResult<string>;
			try {
				next = await iterator.next();
			} catch (error) {
				if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
				throw error;
			}
			if (next.done) break;
			const chunk = next.value;
			let start = 0;
			for (let end = chunk.indexOf("\n"); end !== -1; end = chunk.indexOf("\n", start)) {
				emit(chunk.slice(start, end));
				start = end + 1;
			}
			if (start < chunk.length) parts.push(chunk.slice(start));
		}
		if (parts.length > 0) emit("");
	} finally {
		stream.destroy();
	}
}

// A count from a transcript, or 0. A negative or non-numeric count must not
// subtract from a total.
export function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

// The entry time: the parsed timestamp when it is valid and not more than
// 26 hours in the future, else the mtime of the file. Never NaN.
export function entryTimestamp(raw: string | undefined, mtimeMs: number): number {
	const parsed = raw ? Date.parse(raw) : Number.NaN;
	if (Number.isFinite(parsed) && parsed <= Date.now() + 26 * 60 * 60 * 1000) return parsed;
	return mtimeMs;
}

type ClaudeLine = {
	type?: string;
	requestId?: string;
	isMeta?: boolean;
	timestamp?: string;
	cwd?: string;
	message?: {
		id?: string;
		model?: string;
		content?: string | Array<{ type?: string; text?: string }>;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_read_input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
			output_tokens_details?: { thinking_tokens?: number };
		};
	};
};

// Parses one `<profile>/projects/<encoded cwd>/<session id>.jsonl` file.
// `entriesByMessage` is shared across every file, so a resumed or forked
// session counts each request once. An entry with no message id and no
// request id goes to `out` directly.
export async function parseClaudeLogFile(
	file: LogFile,
	entriesByMessage: Map<string, UsageLogEntry>,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<void> {
	const sessionId = sessionIdForFile(file.path);
	await forEachLine(file.path, (line) => {
		const assistant = line.includes('"assistant"');
		const wantLabel = !assistant && line.includes('"user"') && !sessionLabels.has(sessionId);
		if (!assistant && !wantLabel) return;
		let parsed: ClaudeLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (wantLabel && parsed.type === "user" && !parsed.isMeta) {
			const content = parsed.message?.content;
			const text = typeof content === "string" ? content : content?.find((block) => block.type === "text")?.text;
			const label = toSessionLabel(text);
			if (label) sessionLabels.set(sessionId, label);
		}
		if (parsed.type !== "assistant") return;
		const usage = parsed.message?.usage;
		const model = parsed.message?.model;
		if (!usage || !model || model === "<synthetic>") return;
		const timestampMs = entryTimestamp(parsed.timestamp, file.mtimeMs);
		if (timestampMs < cutoffMs) return;
		const cacheWriteTotal = num(usage.cache_creation_input_tokens);
		const write5m = num(usage.cache_creation?.ephemeral_5m_input_tokens);
		const write1h = num(usage.cache_creation?.ephemeral_1h_input_tokens);
		const entry: UsageLogEntry = {
			harness: "claude",
			model,
			timestampMs,
			cwd: typeof parsed.cwd === "string" ? parsed.cwd : null,
			sessionId,
			// Anthropic's input_tokens excludes cache reads and cache writes.
			uncachedInput: num(usage.input_tokens),
			cachedInput: num(usage.cache_read_input_tokens),
			// An older log has no 5m and 1h split. Its total counts as 5m writes.
			cacheWrite5m: write5m + write1h > 0 ? write5m : cacheWriteTotal,
			cacheWrite1h: write1h,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.output_tokens_details?.thinking_tokens),
		};
		const dedupeKey = `${parsed.message?.id ?? ""}|${parsed.requestId ?? ""}`;
		if (dedupeKey === "|") out.push(entry);
		else entriesByMessage.set(dedupeKey, entry);
	});
}

type CodexLine = {
	type?: string;
	timestamp?: string;
	payload?: {
		type?: string;
		id?: string;
		model?: string;
		cwd?: string;
		message?: string;
		info?: {
			last_token_usage?: {
				input_tokens?: number;
				cached_input_tokens?: number;
				cache_write_input_tokens?: number;
				output_tokens?: number;
				reasoning_output_tokens?: number;
			};
		};
	};
};

// Parses one `<profile>/sessions/<year>/<month>/<day>/rollout-*.jsonl`
// file. The file name carries a date and the thread id, so the session id
// comes from the `session_meta` event, which Codex writes first.
export async function parseCodexLogFile(
	file: LogFile,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<void> {
	let sessionId = sessionIdForFile(file.path);
	let currentModel: string | null = null;
	let currentCwd: string | null = null;
	// Codex sometimes writes the same token_count event twice in a row. A
	// repeated delta is skipped, which brings the sum within 1% of the
	// cumulative counter of the session.
	let previousDeltaSignature: string | null = null;
	await forEachLine(file.path, (line) => {
		const isContext = line.includes('"turn_context"') || line.includes('"session_meta"');
		const isCount = line.includes('"token_count"');
		const wantLabel = !isContext && !isCount && line.includes('"user_message"') && !sessionLabels.has(sessionId);
		if (!isContext && !isCount && !wantLabel) return;
		let parsed: CodexLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (wantLabel && parsed.payload?.type === "user_message") {
			const label = toSessionLabel(parsed.payload.message);
			if (label) sessionLabels.set(sessionId, label);
			return;
		}
		if (parsed.type === "turn_context" || parsed.type === "session_meta") {
			if (parsed.type === "session_meta" && typeof parsed.payload?.id === "string") sessionId = parsed.payload.id;
			if (typeof parsed.payload?.model === "string") currentModel = parsed.payload.model;
			if (typeof parsed.payload?.cwd === "string") currentCwd = parsed.payload.cwd;
			return;
		}
		if (parsed.payload?.type !== "token_count") return;
		const usage = parsed.payload.info?.last_token_usage;
		if (!usage) return;
		const signature = JSON.stringify(usage);
		if (signature === previousDeltaSignature) return;
		previousDeltaSignature = signature;
		const timestampMs = entryTimestamp(parsed.timestamp, file.mtimeMs);
		if (timestampMs < cutoffMs) return;
		const input = num(usage.input_tokens);
		const cached = num(usage.cached_input_tokens);
		out.push({
			harness: "codex",
			model: currentModel ?? "unknown",
			timestampMs,
			cwd: currentCwd,
			sessionId,
			// OpenAI's input_tokens includes the cached tokens.
			uncachedInput: Math.max(0, input - cached),
			cachedInput: cached,
			cacheWrite5m: num(usage.cache_write_input_tokens),
			cacheWrite1h: 0,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.reasoning_output_tokens),
		});
	});
}
