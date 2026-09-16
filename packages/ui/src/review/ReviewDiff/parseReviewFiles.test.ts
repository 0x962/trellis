import { expect, test } from "bun:test";
import { parseReviewFiles } from "./parseReviewFiles";

test("review files parse changes without syntax grammar downloads", () => {
	const files = parseReviewFiles(
		"diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -2,2 +2,2 @@ section\n-old\n+new\n same\n",
	);
	expect(files).toHaveLength(1);
	expect(files[0]).toMatchObject({
		name: "a.ts",
		prevName: "a.ts",
		type: "change",
		additionLines: ["new", "same"],
		deletionLines: ["old", "same"],
	});
	expect(files[0]?.hunks[0]).toMatchObject({
		additionStart: 2,
		additionCount: 2,
		additionLines: 1,
		deletionStart: 2,
		deletionCount: 2,
		deletionLines: 1,
		hunkSpecs: "@@ -2,2 +2,2 @@ section",
	});
});

test("review files keep added, deleted, and renamed file metadata", () => {
	const files = parseReviewFiles(
		[
			"diff --git a/new.ts b/new.ts",
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/new.ts",
			"@@ -0,0 +1 @@",
			"+new",
			"diff --git a/old.ts b/old.ts",
			"deleted file mode 100644",
			"--- a/old.ts",
			"+++ /dev/null",
			"@@ -1 +0,0 @@",
			"-old",
			"diff --git a/before.ts b/after.ts",
			"similarity index 100%",
			"rename from before.ts",
			"rename to after.ts",
			"",
		].join("\n"),
	);
	expect(files.map(({ name, prevName, type }) => ({ name, prevName, type }))).toEqual([
		{ name: "new.ts", prevName: undefined, type: "new" },
		{ name: "old.ts", prevName: "old.ts", type: "deleted" },
		{ name: "after.ts", prevName: "before.ts", type: "rename-pure" },
	]);
});
