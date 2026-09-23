import { expect, test } from "bun:test";
import { carryLine, placeThreads, threadDiffLine } from "./carryThreads";
import { parseReviewFiles } from "./parseReviewFiles";
import type { DiffThread } from "./ReviewDiff";

// The file on screen. Line 2 of the new side reads "second", and line 3
// reads "third".
const patch = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 first
-two
+second
 third
`;

const files = parseReviewFiles(patch);
const nothingExpanded = new Map();

const thread = (fields: Partial<DiffThread>): DiffThread => ({
	id: "t1",
	path: "file.ts",
	side: "new",
	line: 2,
	startLine: 2,
	version: 1,
	updatedAt: "",
	revisionId: "head",
	...fields,
});

const placeOne = (one: DiffThread) => placeThreads(files, nothingExpanded, [one], "head").get(one.id);

test("a thread of the revision on screen sits on the line it names", () => {
	expect(placeOne(thread({}))).toEqual({ kind: "current", side: "new", line: 2 });
});

test("a thread that names no revision sits on the line it names", () => {
	expect(placeOne(thread({ revisionId: null, line: 3 }))).toEqual({ kind: "current", side: "new", line: 3 });
});

test("a thread of an earlier revision moves to the line that still holds its text", () => {
	const earlier = thread({ revisionId: "older", line: 40, startLine: 40, anchorLines: ["third"] });

	expect(placeOne(earlier)).toEqual({ kind: "carried", side: "new", line: 3 });
});

test("a thread of an earlier revision is outdated when the file holds its text no more", () => {
	const earlier = thread({ revisionId: "older", anchorLines: ["a line that the file lost"] });

	expect(placeOne(earlier)).toEqual({ kind: "outdated" });
});

test("a thread of an earlier revision with no text of its own is outdated", () => {
	expect(placeOne(thread({ revisionId: "older", anchorLines: null }))).toEqual({ kind: "outdated" });
});

test("a thread of an earlier revision reads the old side against the old side", () => {
	const earlier = thread({ revisionId: "older", side: "old", line: 9, startLine: 9, anchorLines: ["two"] });

	expect(placeOne(earlier)).toEqual({ kind: "carried", side: "old", line: 2 });
});

test("two lines of text carry to the last of the two", () => {
	const earlier = thread({ revisionId: "older", line: 9, startLine: 8, anchorLines: ["second", "third"] });

	expect(placeOne(earlier)).toEqual({ kind: "carried", side: "new", line: 3 });
});

test("the closest of two equal places wins", () => {
	const text = new Map([
		[2, "same"],
		[3, "other"],
		[20, "same"],
	]);

	expect(carryLine(text, ["same"], 19)).toBe(20);
	expect(carryLine(text, ["same"], 4)).toBe(2);
	expect(carryLine(text, ["missing"], 4)).toBeNull();
});

test("the diff line of a carried thread is the line its text moved to", () => {
	const earlier = thread({ revisionId: "older", line: 40, startLine: 40, anchorLines: ["third"] });

	expect(threadDiffLine(patch, earlier, "head")).toBe(3);
	expect(threadDiffLine(patch, thread({}), "head")).toBe(2);
});

test("an outdated thread has no diff line, because the diff draws it at the top of its file", () => {
	const gone = thread({ revisionId: "older", anchorLines: ["a line that the file lost"] });

	expect(threadDiffLine(patch, gone, "head")).toBeNull();
});
