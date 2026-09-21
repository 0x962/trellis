import type { PrChangeType } from "@trellis/api";

// One changed file of a pull request, as the diff of the revision reports it.
export type ReadMarkFile = { path: string; change: PrChangeType; additions: number; deletions: number };

// The files the person marked read. The key is the path. The value is the
// shape the file had at the mark.
export type ReadMarks = Record<string, string>;

const storageKey = (pr: string) => `trellis.review.read:${pr}`;

// The shape of a file at one revision. A mark holds the shape, so a later
// revision that changes the file makes `isRead` false and the person reads it
// again.
export const fileShape = (file: ReadMarkFile) => `${file.change}:${file.additions}:${file.deletions}`;

export const isRead = (marks: ReadMarks, file: ReadMarkFile) => marks[file.path] === fileShape(file);

export function setReadMark(marks: ReadMarks, file: ReadMarkFile, read: boolean): ReadMarks {
	const next = { ...marks };
	if (read) next[file.path] = fileShape(file);
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
