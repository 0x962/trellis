// One changed file of a pull request, as the diff of the revision reports it.
export type ReadMarkFile = { path: string; type: string; additions: number; deletions: number };

// The files the person marked read. The key is the path. The value is the
// shape the file had when he marked it.
export type ReadMarks = Record<string, string>;

const storageKey = (pr: string) => `trellis.review.read:${pr}`;

// What the file looked like at one revision: how Git changed it and how many
// lines it adds and deletes. A later revision that edits the file gives it
// another shape, so `isRead` returns false and the person reads it again. A
// later revision that leaves the file alone keeps the shape and the mark.
export const fileShape = (file: ReadMarkFile) => `${file.type}:${file.additions}:${file.deletions}`;

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
