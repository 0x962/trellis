import { expect, test } from "bun:test";
import { parsePatchFiles } from "@pierre/diffs";
import { lineAnnotations } from "./lineAnnotations";

const file = parsePatchFiles(
	"diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n same\n",
)[0]!.files[0]!;
const anchor = { path: "a.ts", side: "new" as const, startLine: 1, line: 2 };
const thread = { ...anchor, id: "thread", version: 1, updatedAt: "today", revisionId: "current" };

test("puts the composer beneath the selected end line beside existing threads", () => {
	expect(lineAnnotations(file, [thread], "current", anchor)).toEqual([
		{ side: "additions", lineNumber: 2, metadata: "thread" },
		{ side: "additions", lineNumber: 2, metadata: "composer" },
	]);
});
test("keeps old-side composers on the old side and excludes other files", () => {
	expect(lineAnnotations(file, [], "current", { ...anchor, side: "old" })[0]?.side).toBe("deletions");
	expect(lineAnnotations(file, [], "current", { ...anchor, path: "b.ts" })).toEqual([]);
});
test("removes the composer on cancel and keeps historical threads out of the current diff", () => {
	expect(lineAnnotations(file, [thread, { ...thread, id: "old", revisionId: null }], "current", null)).toHaveLength(1);
});
