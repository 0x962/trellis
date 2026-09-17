// OpenCode writes one small JSON file per assistant message under
// `<data>/opencode/storage/message/<session id>/msg_*.json`. The file holds
// the tokens (input is already the uncached part), the model, the cwd, and
// a cost in USD. Session titles live under `<data>/opencode/storage/session/`.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { UsageLogEntry } from "./parse.ts";
import { num } from "./parse.ts";

type OpencodeMessage = {
	sessionID?: string;
	role?: string;
	time?: { created?: number; completed?: number };
	modelID?: string;
	path?: { cwd?: string };
	cost?: number;
	tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } };
};

async function readSessionTitles(
	storageDir: string,
	wantedSessions: ReadonlySet<string>,
	sessionLabels: Map<string, string>,
): Promise<void> {
	const sessionRoot = join(storageDir, "session");
	let projectDirs: string[];
	try {
		const entries = await readdir(sessionRoot, { withFileTypes: true });
		projectDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return;
	}
	for (const projectDir of projectDirs) {
		let files: string[];
		try {
			files = await readdir(join(sessionRoot, projectDir));
		} catch {
			continue;
		}
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			const sessionId = file.slice(0, -".json".length);
			if (!wantedSessions.has(sessionId) || sessionLabels.has(sessionId)) continue;
			try {
				const session = JSON.parse(await readFile(join(sessionRoot, projectDir, file), "utf-8")) as { title?: string };
				if (typeof session.title === "string" && session.title) sessionLabels.set(sessionId, session.title);
			} catch {
				// The session file is unreadable, so its entries stay unlabeled.
			}
		}
	}
}

// Returns the number of message files it read.
export async function collectOpencodeEntries(
	storageDir: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<number> {
	const messageRoot = join(storageDir, "message");
	let sessionDirs: string[];
	try {
		const entries = await readdir(messageRoot, { withFileTypes: true });
		sessionDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return 0;
	}
	let scanned = 0;
	const seenSessions = new Set<string>();
	for (const sessionDir of sessionDirs) {
		const dirPath = join(messageRoot, sessionDir);
		// The mtime of the message directory bounds every message inside it.
		try {
			if ((await stat(dirPath)).mtimeMs < cutoffMs) continue;
		} catch {
			continue;
		}
		let files: string[];
		try {
			files = await readdir(dirPath);
		} catch {
			continue;
		}
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			scanned++;
			let message: OpencodeMessage;
			try {
				message = JSON.parse(await readFile(join(dirPath, file), "utf-8"));
			} catch {
				continue;
			}
			if (message.role !== "assistant") continue;
			const timestampMs = num(message.time?.completed ?? message.time?.created);
			if (!timestampMs || timestampMs < cutoffMs) continue;
			const tokens = message.tokens;
			if (!tokens) continue;
			const uncachedInput = num(tokens.input);
			const cachedInput = num(tokens.cache?.read);
			const cacheWrite = num(tokens.cache?.write);
			const output = num(tokens.output);
			if (uncachedInput + cachedInput + cacheWrite + output === 0) continue;
			const sessionId = message.sessionID ?? sessionDir;
			seenSessions.add(sessionId);
			const cost = num(message.cost);
			out.push({
				harness: "opencode",
				model: message.modelID || "unknown",
				timestampMs,
				cwd: typeof message.path?.cwd === "string" ? message.path.cwd : null,
				sessionId,
				uncachedInput,
				cachedInput,
				cacheWrite5m: cacheWrite,
				cacheWrite1h: 0,
				output,
				reasoningOutput: num(tokens.reasoning),
				...(cost > 0 ? { costUsd: cost } : {}),
			});
		}
	}
	if (seenSessions.size > 0) await readSessionTitles(storageDir, seenSessions, sessionLabels);
	return scanned;
}
