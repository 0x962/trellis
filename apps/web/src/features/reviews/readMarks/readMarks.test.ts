import { expect, test } from "bun:test";
import {
	fileShape,
	isRead,
	loadReadMarks,
	type ReadMarkFile,
	type ReadMarks,
	saveReadMarks,
	setReadMark,
} from "./readMarks";

const file: ReadMarkFile = { path: "apps/web/src/app.tsx", change: "change", additions: 12, deletions: 3 };

const memoryStorage = (): Storage => {
	const entries = new Map<string, string>();
	return {
		get length() {
			return entries.size;
		},
		clear: () => entries.clear(),
		getItem: (key: string) => entries.get(key) ?? null,
		key: (index: number) => [...entries.keys()][index] ?? null,
		removeItem: (key: string) => entries.delete(key),
		setItem: (key: string, value: string) => entries.set(key, value),
	};
};

test("a marked file reads as read", () => {
	const marks = setReadMark({}, file, true);

	expect(isRead(marks, file)).toBe(true);
});

test("an unmarked file reads as unread", () => {
	const marks = setReadMark(setReadMark({}, file, true), file, false);

	expect(marks).toEqual({});
	expect(isRead(marks, file)).toBe(false);
});

test("the mark survives a revision that leaves the file alone", () => {
	const marks = setReadMark({}, file, true);

	expect(isRead(marks, { ...file })).toBe(true);
});

test("the mark drops when the revision changes the line counts", () => {
	const marks = setReadMark({}, file, true);

	expect(isRead(marks, { ...file, additions: 13 })).toBe(false);
	expect(isRead(marks, { ...file, deletions: 0 })).toBe(false);
});

test("the mark drops when the revision changes how Git changed the file", () => {
	const marks = setReadMark({}, file, true);

	expect(isRead(marks, { ...file, change: "new" })).toBe(false);
});

test("the mark of one file leaves another file unread", () => {
	const marks = setReadMark({}, file, true);

	expect(isRead(marks, { ...file, path: "apps/web/src/main.tsx" })).toBe(false);
});

test("the shape names the change and both line counts", () => {
	expect(fileShape(file)).toBe("change:12:3");
});

test("a pull request with no stored marks loads an empty record", () => {
	expect(loadReadMarks(memoryStorage(), "0x962/trellis#161")).toEqual({});
});

test("a saved record loads back under the same pull request", () => {
	const storage = memoryStorage();
	const marks: ReadMarks = setReadMark({}, file, true);

	saveReadMarks(storage, "0x962/trellis#161", marks);

	expect(loadReadMarks(storage, "0x962/trellis#161")).toEqual(marks);
	expect(loadReadMarks(storage, "0x962/trellis#162")).toEqual({});
});
