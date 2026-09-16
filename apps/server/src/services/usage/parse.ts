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
import type { AccountHarness } from "@trellis/api";
import type { LogFile } from "./logs.ts";

export type UsageLogEntry = {
	harness: AccountHarness;
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

const SESSION_LABEL_MAX = 80;

// A user line is parsed for the session label only while it is short and
// only for the first few user lines of a file. A tool result rides on a
// user line and can be many MB, and a session whose prompts all start with
// a system reminder never yields a label, so without both bounds the scan
// parses every tool result on the machine.
export const LABEL_LINE_MAX = 16 * 1024;
export const LABEL_ATTEMPTS = 8;

// Whether one more user line of a session should be parsed for its label.
export function wantsLabel(sessionId: string, labels: Map<string, string>, attempts: Map<string, number>): boolean {
	if (labels.has(sessionId)) return false;
	const made = attempts.get(sessionId) ?? 0;
	if (made >= LABEL_ATTEMPTS) return false;
	attempts.set(sessionId, made + 1);
	return true;
}

// The first real user prompt of a session, cut to one short line. A slash
// command, a caveat, and a system reminder wrapper do not count.
export function toSessionLabel(text: unknown): string | null {
	if (typeof text !== "string") return null;
	const trimmed = text.trim();
	if (!trimmed || trimmed.startsWith("<") || trimmed.startsWith("#") || trimmed.startsWith("Caveat:")) return null;
	const line = trimmed.split("\n", 1)[0] ?? "";
	if (!line) return null;
	return line.length > SESSION_LABEL_MAX ? `${line.slice(0, SESSION_LABEL_MAX - 1)}…` : line;
}

// The longest line a parser accepts. A real transcript line stays under
// 10 MB, so a longer run of bytes without a newline is a corrupt or foreign
// file. V8 refuses a string past about 512 MB, and node:readline buffers a
// newline-free run without limit, so the bound is what keeps one data file
// from killing the process.
export const MAX_LINE_LENGTH = 32 * 1024 * 1024;

// Calls `onLine` for every `\n`-terminated line of a UTF-8 file, with a
// trailing `\r` removed. A line longer than MAX_LINE_LENGTH is skipped, and
// the file continues at the next newline.
export async function forEachLine(path: string, onLine: (line: string) => void): Promise<void> {
	let pending = "";
	let skipping = false;
	const emit = (raw: string) => {
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		if (line.length <= MAX_LINE_LENGTH) onLine(line);
	};
	try {
		const chunks = createReadStream(path, { encoding: "utf-8" }) as AsyncIterable<string>;
		for await (const chunk of chunks) {
			let start = 0;
			for (let end = chunk.indexOf("\n"); end !== -1; end = chunk.indexOf("\n", start)) {
				if (skipping) skipping = false;
				else {
					const line = pending + chunk.slice(start, end);
					pending = "";
					emit(line);
				}
				start = end + 1;
			}
			if (skipping) continue;
			pending += chunk.slice(start);
			if (pending.length > MAX_LINE_LENGTH) {
				pending = "";
				skipping = true;
			}
		}
		if (!skipping && pending) emit(pending);
	} catch {
		// The CLI removed or truncated the file during the scan.
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
	const attempts = new Map<string, number>();
	await forEachLine(file.path, (line) => {
		const assistant = line.includes('"assistant"');
		const wantLabel =
			!assistant &&
			line.length <= LABEL_LINE_MAX &&
			line.includes('"user"') &&
			wantsLabel(sessionId, sessionLabels, attempts);
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
	const attempts = new Map<string, number>();
	await forEachLine(file.path, (line) => {
		const isContext = line.includes('"turn_context"') || line.includes('"session_meta"');
		const isCount = line.includes('"token_count"');
		const wantLabel =
			!isContext &&
			!isCount &&
			line.length <= LABEL_LINE_MAX &&
			line.includes('"user_message"') &&
			wantsLabel(sessionId, sessionLabels, attempts);
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
