import type { ResourceCommentThread } from "@trellis/api";

export type ThreadPlace = { from: number } | null;

export type MarginThread = { thread: ResourceCommentThread; textRemoved: boolean };

// The threads the comments margin shows, in the order their text reads in the
// document. `placeOf` answers where the editor sees the text of a thread now:
// a position, null when an edit removed the text, or undefined before the
// editor tracks the thread. A thread whose text is gone goes last. A resolved
// thread shows only when `showResolved` is true.
export const marginThreads = (
	threads: readonly ResourceCommentThread[],
	placeOf: (id: string) => ThreadPlace | undefined,
	showResolved: boolean,
): MarginThread[] => {
	const rows = threads
		.filter((thread) => showResolved || thread.resolved === null)
		.map((thread, index) => {
			const place = placeOf(thread.id);
			const textRemoved = place === undefined ? thread.textRemoved : place === null;
			return { thread, textRemoved, from: place?.from ?? Number.POSITIVE_INFINITY, index };
		});
	rows.sort((a, b) => a.from - b.from || a.index - b.index);
	return rows.map(({ thread, textRemoved }) => ({ thread, textRemoved }));
};
