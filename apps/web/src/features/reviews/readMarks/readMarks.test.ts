import { expect, test } from "bun:test";
import { patchDigest } from "@trellis/ui/review";
import { isRead, loadReadMarks, type ReadMarkFile, type ReadMarks, saveReadMarks, setReadMark } from "./readMarks";

const file: ReadMarkFile = {
	path: "apps/web/src/app.tsx",
	change: "change",
	additions: 12,
	deletions: 3,
	binary: false,
	digest: "1a2b3c",
};

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

test("the mark drops when the revision changes the content of the file", () => {
	const marks = setReadMark({}, file, true);

	expect(isRead(marks, { ...file, digest: "9f8e7d" })).toBe(false);
});

// A rewrite that swaps one line for another line keeps the change word, the
// added line count and the deleted line count. Only the patch text changes.
test("the mark drops when a revision rewrites one line for another line", () => {
	const before = `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,1 +1,1 @@
-const limit = 10;
+const limit = 20;
`;
	const after = before.replace("+const limit = 20;", "+const limit = 30;");
	const read = setReadMark({}, { ...file, digest: patchDigest(before) }, true);

	expect(isRead(read, { ...file, digest: patchDigest(before) })).toBe(true);
	expect(isRead(read, { ...file, digest: patchDigest(after) })).toBe(false);
});

test("the mark of one file leaves another file unread", () => {
	const marks = setReadMark({}, file, true);

	expect(isRead(marks, { ...file, path: "apps/web/src/main.tsx" })).toBe(false);
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
