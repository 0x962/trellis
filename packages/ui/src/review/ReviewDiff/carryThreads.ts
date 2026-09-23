import { parseReviewFiles, type ReviewFile } from "./parseReviewFiles";
import type { DiffThread } from "./ReviewDiff";
import { drawnLineText, type ExpandedFile } from "./reviewRows";

// Where the diff on screen draws one comment thread.
//
// `current` is a thread written against the revision on screen, or against
// no revision at all. It sits on the line it names.
// `carried` is a thread written against an earlier revision. The file on
// screen still holds the lines it was written against, at line `line` of
// side `side`, so the thread moves there.
// `outdated` is a thread written against an earlier revision whose lines
// the file on screen holds no more. The diff draws it at the top of its
// file, with the text of those lines.
export type ThreadPlacement =
	| { kind: "current"; side: "old" | "new"; line: number }
	| { kind: "carried"; side: "old" | "new"; line: number }
	| { kind: "outdated" };

// The number of the last line of the closest place where `text` holds
// `lines` one after another, or null when it holds them nowhere. Two equal
// places are decided by `near`, the line the thread named in the revision
// it was written against.
export const carryLine = (text: ReadonlyMap<number, string>, lines: readonly string[], near: number): number | null => {
	let found: number | null = null;
	for (const start of text.keys()) {
		if (!lines.every((line, index) => text.get(start + index) === line)) continue;
		const end = start + lines.length - 1;
		if (found === null || Math.abs(end - near) < Math.abs(found - near)) found = end;
	}
	return found;
};

// Where the diff draws one thread. A thread that names an earlier revision
// and carries no text of its own cannot be searched for, so it counts as
// outdated and the diff draws it at the top of its file.
export const placeThread = (
	thread: DiffThread,
	revisionId: string,
	text: { old: ReadonlyMap<number, string>; new: ReadonlyMap<number, string> },
): ThreadPlacement => {
	if (thread.revisionId === null || thread.revisionId === revisionId)
		return { kind: "current", side: thread.side, line: thread.line };
	const lines = thread.anchorLines ?? null;
	if (lines === null || lines.length === 0) return { kind: "outdated" };
	const line = carryLine(text[thread.side], lines, thread.line);
	return line === null ? { kind: "outdated" } : { kind: "carried", side: thread.side, line };
};

// Where the diff draws each thread of these files, by thread id. A thread
// whose file the diff does not show gets no place and draws nowhere.
export const placeThreads = (
	files: ReviewFile[],
	expanded: ReadonlyMap<string, ExpandedFile>,
	threads: DiffThread[],
	revisionId: string,
): ReadonlyMap<string, ThreadPlacement> => {
	const places = new Map<string, ThreadPlacement>();
	for (const file of files) {
		const ofFile = threads.filter((thread) => thread.path === file.name);
		if (ofFile.length === 0) continue;
		const text = drawnLineText(file, expanded.get(file.name));
		for (const thread of ofFile) places.set(thread.id, placeThread(thread, revisionId, text));
	}
	return places;
};

// The line of this patch that the diff draws one thread on, or null when it
// draws the thread at the top of its file. A link that opens a thread on the
// Diff tab reads this, because a thread of an earlier revision names a line
// number of a diff that the page does not draw.
export const threadDiffLine = (patch: string, thread: DiffThread, revisionId: string): number | null => {
	const place = placeThreads(parseReviewFiles(patch), new Map(), [thread], revisionId).get(thread.id);
	return place === undefined || place.kind === "outdated" ? null : place.line;
};
