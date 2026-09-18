import { describe, expect, test } from "bun:test";
import { patchLines } from "./reviewPatch";

const patch = [
	"diff --git a/src/app.ts b/src/app.ts",
	"index 1111111..2222222 100644",
	"--- a/src/app.ts",
	"+++ b/src/app.ts",
	"@@ -1,4 +1,4 @@",
	" const a = 1;",
	"-const b = 2;",
	"+const b = 3;",
	"+const c = 4;",
	" export { a };",
	"-export { b };",
	"@@ -20,2 +21,2 @@",
	" twenty",
	"-twenty one",
	"+twenty one changed",
	"diff --git a/other.md b/other.md",
	"--- a/other.md",
	"+++ b/other.md",
	"@@ -1 +1 @@",
	"-old",
	"+new",
	"",
].join("\n");

describe("patchLines", () => {
	test("reads new-side lines across a change", () => {
		expect(patchLines(patch, "src/app.ts", "new", 1, 4)).toEqual([
			"const a = 1;",
			"const b = 3;",
			"const c = 4;",
			"export { a };",
		]);
	});

	test("reads old-side lines with their own numbers", () => {
		expect(patchLines(patch, "src/app.ts", "old", 2, 4)).toEqual(["const b = 2;", "export { a };", "export { b };"]);
	});

	test("reads a later hunk", () => {
		expect(patchLines(patch, "src/app.ts", "new", 21, 22)).toEqual(["twenty", "twenty one changed"]);
	});

	test("answers null outside the hunks or for another file", () => {
		expect(patchLines(patch, "src/app.ts", "new", 4, 6)).toBeNull();
		expect(patchLines(patch, "missing.ts", "new", 1, 1)).toBeNull();
	});

	test("finds a second file", () => {
		expect(patchLines(patch, "other.md", "new", 1, 1)).toEqual(["new"]);
	});
});
