// Pi sessions are JSONL trees under `<profile>/sessions/--<encoded cwd>--/`.
// The first line is a `{type:"session"}` header with the session id and the
// cwd. Each `{type:"message"}` line with an assistant message holds the
// model and a usage block: input, output, cacheRead, cacheWrite, and a cost
// that Pi computed itself. Pi appends each entry once and branches by parent
// id, so no dedupe across files is needed.

import type { LogFile } from "./logs.ts";
import { collectLogFiles } from "./logs.ts";
import type { UsageLogEntry } from "./parse.ts";
import {
	entryTimestamp,
	forEachLine,
	LABEL_LINE_MAX,
	num,
	sessionIdForFile,
	toSessionLabel,
	wantsLabel,
} from "./parse.ts";

type PiLine = {
	type?: string;
	id?: string;
	timestamp?: string;
	cwd?: string;
	message?: {
		role?: string;
		model?: string;
		timestamp?: number;
		content?: string | Array<{ type?: string; text?: string }>;
		usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } };
	};
};

async function parsePiLogFile(
	file: LogFile,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<void> {
	let sessionId = sessionIdForFile(file.path);
	let sessionCwd: string | null = null;
	const attempts = new Map<string, number>();
	await forEachLine(file.path, (line) => {
		const wanted = line.includes('"session"') || line.includes('"assistant"');
		const wantLabel =
			!wanted &&
			line.length <= LABEL_LINE_MAX &&
			line.includes('"user"') &&
			wantsLabel(sessionId, sessionLabels, attempts);
		if (!wanted && !wantLabel) return;
		let parsed: PiLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (parsed.type === "session") {
			if (typeof parsed.id === "string") sessionId = parsed.id;
			if (typeof parsed.cwd === "string") sessionCwd = parsed.cwd;
			return;
		}
		if (parsed.type !== "message") return;
		const message = parsed.message;
		if (!message) return;
		if (wantLabel && message.role === "user") {
			const content = message.content;
			const text = typeof content === "string" ? content : content?.find((block) => block.type === "text")?.text;
			const label = toSessionLabel(text);
			if (label) sessionLabels.set(sessionId, label);
			return;
		}
		if (message.role !== "assistant") return;
		const usage = message.usage;
		if (!usage || !message.model) return;
		const timestampMs =
			typeof message.timestamp === "number" && message.timestamp > 0
				? message.timestamp
				: entryTimestamp(parsed.timestamp, file.mtimeMs);
		if (timestampMs < cutoffMs) return;
		const cost = num(usage.cost?.total);
		out.push({
			harness: "pi",
			model: message.model,
			timestampMs,
			cwd: sessionCwd,
			sessionId,
			// Pi's input count excludes the cache fields it tracks separately.
			uncachedInput: num(usage.input),
			cachedInput: num(usage.cacheRead),
			cacheWrite5m: num(usage.cacheWrite),
			cacheWrite1h: 0,
			output: num(usage.output),
			reasoningOutput: 0,
			...(cost > 0 ? { costUsd: cost } : {}),
		});
	});
}

// Returns the number of session files it read.
export async function collectPiEntries(
	root: string,
	days: number,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<number> {
	const files = await collectLogFiles(root, days + 1);
	for (const file of files) await parsePiLogFile(file, cutoffMs, out, sessionLabels);
	return files.length;
}
