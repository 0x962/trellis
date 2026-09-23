import type { PrChangeType } from "@trellis/api";

// One changed file of a pull request, as the diff of the revision reports it.
export type ReadMarkFile = {
	path: string;
	change: PrChangeType;
	additions: number;
	deletions: number;
	// True when Git stores the file as bytes.
	binary: boolean;
	// The hash of the patch text of this file, from `patchDigest`.
	digest: string;
};

// The files the person marked read. The key is the path. The value is the
// `digest` the file had at the moment of the mark.
//
// The digest covers every byte of the patch of that file, so a revision that
// rewrites one line for another line gives a new digest, `isRead` turns false,
// and the person reads the file again. A count of added and deleted lines
// would stay the same across that rewrite and would tell the person they read
// a file they did not read.
export type ReadMarks = Record<string, string>;

const storageKey = (pr: string) => `trellis.review.read:${pr}`;

export const isRead = (marks: ReadMarks, file: ReadMarkFile) => marks[file.path] === file.digest;

export function setReadMark(marks: ReadMarks, file: ReadMarkFile, read: boolean): ReadMarks {
	const next = { ...marks };
	if (read) next[file.path] = file.digest;
	else delete next[file.path];
	return next;
}

export function loadReadMarks(storage: Storage, pr: string): ReadMarks {
	const stored = storage.getItem(storageKey(pr));
	return stored === null ? {} : (JSON.parse(stored) as ReadMarks);
}

export function saveReadMarks(storage: Storage, pr: string, marks: ReadMarks) {
	storage.setItem(storageKey(pr), JSON.stringify(marks));
}
