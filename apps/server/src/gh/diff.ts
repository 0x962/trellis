import type { PullRequestDiffOutput } from "@trellis/api";
import type { GhFailure, GhRunner } from "./run.ts";

// `gh pr diff <url>` runs on the interactive slot, so a person who opens a
// diff never waits behind a poller tick.

export const DIFF_PAGE_BYTES = 1_048_576;

export type FetchDiffResult = { ok: true; diff: string } | GhFailure;

// `nextCursor` names the first UTF-8 byte of the next page. If a character
// crosses the page size, the page ends before that character.
export const diffPage = (bytes: Uint8Array, cursor: number): PullRequestDiffOutput => {
	let end = Math.min(cursor + DIFF_PAGE_BYTES, bytes.byteLength);
	if (end < bytes.byteLength) {
		while ((bytes[end]! & 0xc0) === 0x80) end--;
	}
	return {
		diff: new TextDecoder().decode(bytes.subarray(cursor, end)),
		nextCursor: end < bytes.byteLength ? end : null,
	};
};

export const fetchDiff = async (runGh: GhRunner, url: string): Promise<FetchDiffResult> => {
	const result = await runGh("interactive", ["pr", "diff", url]);
	if (!result.ok) return result;
	return { ok: true, diff: result.stdout };
};
