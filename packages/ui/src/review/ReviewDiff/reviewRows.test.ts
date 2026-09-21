import { expect, test } from "bun:test";
import { parseReviewFiles } from "./parseReviewFiles";
import { buildReviewRows } from "./reviewRows";

const patch = [
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

const files = parseReviewFiles(patch);
const nothing = new Map();

const rowsOf = (viewed: string[]) => buildReviewRows(files, "unified", [], "revision", null, nothing, new Set(viewed));

const kindsOf = (viewed: string[], name: string) =>
	rowsOf(viewed)
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
