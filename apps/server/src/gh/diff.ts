import type { PullRequestDiffOutput } from "@trellis/api";
import type { GhFailure, GhRunner } from "./run.ts";

// `gh pr diff <url>` runs on the interactive slot, so a person who opens a
// diff never waits behind a poller tick. A diff over 1 MB is cut at 1 MB of
// UTF-8 and marked truncated; `url` opens the whole diff on GitHub.

export const DIFF_BYTE_CAP = 1_048_576;

export type FetchDiffResult = ({ ok: true } & PullRequestDiffOutput) | GhFailure;

// The decoder runs in stream mode, so a multi-byte character cut by the
// cap is dropped and the text never exceeds the cap.
const cutAtCap = (text: string): { diff: string; truncated: boolean } => {
	const bytes = new TextEncoder().encode(text);
	if (bytes.byteLength <= DIFF_BYTE_CAP) return { diff: text, truncated: false };
	return { diff: new TextDecoder().decode(bytes.subarray(0, DIFF_BYTE_CAP), { stream: true }), truncated: true };
};

export const fetchDiff = async (runGh: GhRunner, url: string): Promise<FetchDiffResult> => {
	const result = await runGh("interactive", ["pr", "diff", url]);
	if (!result.ok) return result;
	return { ok: true, ...cutAtCap(result.stdout), url };
};
