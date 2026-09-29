import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessDescriptor } from "../../agents/harnessHost/types.ts";
import { profileDefault } from "../harnessAccounts/profiles.ts";
import { forEachLine, parseClaudeLogFile, type UsageLogEntry } from "../usage/parse.ts";
import { ObserverHarnessError, type SessionObserverUsage } from "./types.ts";

export async function readObserverTranscriptUsage(
	path: string,
	input: { attemptId: string; providerSessionId: string; text: string },
): Promise<SessionObserverUsage> {
	const selected = new Set<string>();
	let matched = false;
	let complete = false;
	let lastText = "";
	await forEachLine(path, (line) => {
		const row = JSON.parse(line);
		if (row.sessionId !== input.providerSessionId) return;
		const content = row.message?.content;
		const text =
			typeof content === "string"
				? content
				: Array.isArray(content)
					? content
							.filter((part: { type: string }) => part.type === "text")
							.map((part: { text: string }) => part.text)
							.join("\n")
					: "";
		if (row.type === "user" && !row.isMeta && text) {
			matched = text.startsWith(`trellis-message:${input.attemptId}\n`);
			return;
		}
		if (!matched || row.type !== "assistant") return;
		if (row.message?.id && row.requestId && row.message.usage) selected.add(`${row.message.id}|${row.requestId}`);
		complete = row.message?.stop_reason === "end_turn";
		if (text) lastText = text;
	});
	if (!complete || lastText !== input.text)
		throw new ObserverHarnessError(
			"OBSERVER_REPLY_INCOMPLETE",
			"Claude did not record a complete reply for this observer request.",
		);
	const entries = new Map<string, UsageLogEntry>();
	await parseClaudeLogFile({ path, mtimeMs: (await stat(path)).mtimeMs }, entries, 0, [], new Map());
	const requests = [...selected].map((key) => {
		const entry = entries.get(key);
		if (!entry)
			throw new ObserverHarnessError(
				"OBSERVER_USAGE_UNAVAILABLE",
				"Claude has not recorded usage for the observer reply.",
			);
		const [messageId, requestId] = key.split("|");
		return {
			messageId: messageId!,
			requestId: requestId!,
			uncachedInput: entry.uncachedInput,
			cachedInput: entry.cachedInput,
			cacheWrite5m: entry.cacheWrite5m,
			cacheWrite1h: entry.cacheWrite1h,
			output: entry.output,
			reasoningOutput: entry.reasoningOutput,
		};
	});
	if (requests.length === 0)
		throw new ObserverHarnessError(
			"OBSERVER_USAGE_UNAVAILABLE",
			"Claude has not recorded usage for the observer reply.",
		);
	return { source: "claude-transcript", requests };
}

export async function readObserverUsage(
	home: string,
	input: { attemptId: string; providerSessionId: string; text: string },
) {
	const descriptor: HarnessDescriptor = JSON.parse(
		await readFile(join(home, "harness-attempts", input.attemptId, "launch.json"), "utf8"),
	);
	const profile = profileDefault("claude", descriptor.spec.env!);
	const matches = await Array.fromAsync(
		new Bun.Glob(`projects/*/${input.providerSessionId}.jsonl`).scan({ cwd: profile, followSymlinks: true }),
	);
	const paths = [...new Set(await Promise.all(matches.map((path) => realpath(join(profile, path)))))];
	if (paths.length !== 1)
		throw new ObserverHarnessError(
			"OBSERVER_USAGE_UNAVAILABLE",
			"Cannot identify the saved Claude transcript for this observer.",
		);
	return readObserverTranscriptUsage(paths[0]!, input);
}
