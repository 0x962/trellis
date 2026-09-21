import { expect, test } from "bun:test";
import { parseReviewFiles } from "./parseReviewFiles";
import { buildReviewRows, type ExpandedFile, type GapReveal, type ReviewRow } from "./reviewRows";

// One file of 100 lines with two hunks far apart: lines 1 to 3, then lines
// 61 to 63. The gap between the hunks hides 57 lines, and the gap after the
// last hunk hides 37 lines.
const patch = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 line 1
-line 2
+line 2 changed
 line 3
@@ -61,3 +61,3 @@
 line 61
-line 62
+line 62 changed
 line 63
`;

const added = `diff --git a/added.ts b/added.ts
new file mode 100644
--- /dev/null
+++ b/added.ts
@@ -0,0 +1,2 @@
+added one
+added two
`;

const fileLines = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`);

const contents = (gaps: [number, GapReveal][], full = false): ReadonlyMap<string, ExpandedFile> =>
	new Map([["file.ts", { oldLines: fileLines, newLines: fileLines, full, gaps: new Map(gaps) }]]);

const rowsOf = (source: string, expanded: ReadonlyMap<string, ExpandedFile> = new Map()) =>
	buildReviewRows(parseReviewFiles(source), "unified", [], "r", null, expanded, true, new Set());

// One word per row: `@@` for a row between two hunks, with the lines it
// still hides, and the line number of each line the diff draws.
const shape = (rows: ReviewRow[]) =>
	rows.flatMap((row) => {
		if (row.kind === "hunk") return [row.gap === null ? "@@" : `@@ ${row.gap.hidden} hidden`];
		if (row.kind !== "unified") return [];
		if (row.line.type === "deletion") return [`-${row.line.oldLine}`];
		if (row.line.type === "addition") return [`+${row.line.newLine}`];
		return [`${row.line.newLine}`];
	});

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `${from + index}`);

const gaps = (rows: ReviewRow[]) => rows.flatMap((row) => (row.kind === "hunk" && row.gap ? [row.gap] : []));

test("a gap between two hunks offers to open it from above, from below, and reports the hidden lines", () => {
	expect(gaps(rowsOf(patch))).toEqual([
		{ index: 1, hidden: 57, down: true, up: true, all: false },
		// The diff learns the length of the file with the first load, so the
		// row after the last hunk reports no count yet.
		{ index: 2, hidden: null, down: true, up: false, all: false },
	]);
});

test("expand down draws twenty lines under the hunk above the gap", () => {
	expect(shape(rowsOf(patch, contents([[1, { top: 20, bottom: 0 }]])))).toEqual([
		"@@",
		"1",
		"-2",
		"+2",
		"3",
		...range(4, 23),
		"@@ 37 hidden",
		"61",
		"-62",
		"+62",
		"63",
		"@@ 37 hidden",
	]);
});

test("expand up draws twenty lines above the hunk under the gap", () => {
	expect(shape(rowsOf(patch, contents([[1, { top: 0, bottom: 20 }]])))).toEqual([
		"@@",
		"1",
		"-2",
		"+2",
		"3",
		"@@ 37 hidden",
		...range(41, 60),
		"61",
		"-62",
		"+62",
		"63",
		"@@ 37 hidden",
	]);
});

test("a gap of twenty lines or fewer offers one control that opens all of it", () => {
	expect(gaps(rowsOf(patch, contents([[1, { top: 40, bottom: 0 }]])))[0]).toEqual({
		index: 1,
		hidden: 17,
		down: false,
		up: false,
		all: true,
	});
});

test("expand all draws every line of the gap and leaves no control", () => {
	const rows = rowsOf(patch, contents([[1, { top: 57, bottom: 0 }]]));
	expect(shape(rows)).toEqual([
		"@@",
		"1",
		"-2",
		"+2",
		"3",
		...range(4, 60),
		"@@",
		"61",
		"-62",
		"+62",
		"63",
		"@@ 37 hidden",
	]);
});

test("the row after the last hunk opens the end of the file", () => {
	expect(shape(rowsOf(patch, contents([[2, { top: 20, bottom: 0 }]]))).slice(-22)).toEqual([
		"63",
		...range(64, 83),
		"@@ 17 hidden",
	]);
});

test("the file toggle opens every gap of the file", () => {
	const rows = rowsOf(patch, contents([], true));
	expect(gaps(rows)).toEqual([]);
	expect(shape(rows)).toEqual([
		"@@",
		"1",
		"-2",
		"+2",
		"3",
		...range(4, 60),
		"@@",
		"61",
		"-62",
		"+62",
		"63",
		...range(64, 100),
	]);
});

test("an added file has no gap and no control", () => {
	expect(gaps(rowsOf(added))).toEqual([]);
});

test("a file with no expand service has no control", () => {
	const rows = buildReviewRows(parseReviewFiles(patch), "unified", [], "r", null, new Map(), false, new Set());
	expect(gaps(rows)).toEqual([]);
});

test("a thread on a line of an open gap sits on that line", () => {
	const thread = {
		id: "t1",
		path: "file.ts",
		side: "new" as const,
		line: 10,
		startLine: 10,
		version: 1,
		updatedAt: "",
		revisionId: "r",
	};
	const shut = buildReviewRows(parseReviewFiles(patch), "unified", [thread], "r", null, new Map(), true, new Set());
	expect(shut.find((row) => row.kind === "annotation")?.annotations).toEqual(["t1"]);
	const open = buildReviewRows(
		parseReviewFiles(patch),
		"unified",
		[thread],
		"r",
		null,
		contents([[1, { top: 20, bottom: 0 }]]),
		true,
		new Set(),
	);
	expect(open.find((row) => row.kind === "annotation")).toBeUndefined();
	const line = open.filter((row) => row.kind === "unified").find((row) => row.line.newLine === 10);
	expect(line?.annotations).toEqual(["t1"]);
});

const readPatch = [
	"diff --git a/a.ts b/a.ts",
	"--- a/a.ts",
	"+++ b/a.ts",
	"@@ -2,2 +2,2 @@ section",
	"-old",
	"+new",
	" same",
	"diff --git a/b.ts b/b.ts",
	"--- a/b.ts",
	"+++ b/b.ts",
	"@@ -1,1 +1,1 @@",
	"-one",
	"+two",
	"",
].join("\n");

const readFiles = parseReviewFiles(readPatch);
const nothingExpanded = new Map();

const readRowsOf = (viewed: string[]) =>
	buildReviewRows(readFiles, "unified", [], "revision", null, nothingExpanded, false, new Set(viewed));

const kindsOf = (viewed: string[], name: string) =>
	readRowsOf(viewed)
		.filter((row) => row.file.name === name)
		.map((row) => row.kind);

test("a file that nobody marked read keeps its hunk and its lines", () => {
	expect(kindsOf([], "a.ts")).toEqual(["file", "hunk", "unified", "unified", "unified", "end"]);
});

test("a file the person marked read keeps its header and its end only", () => {
	expect(kindsOf(["a.ts"], "a.ts")).toEqual(["file", "end"]);
});

test("a read file collapses and the other files keep every line", () => {
	expect(kindsOf(["a.ts"], "b.ts")).toEqual(["file", "hunk", "unified", "unified", "end"]);
});
