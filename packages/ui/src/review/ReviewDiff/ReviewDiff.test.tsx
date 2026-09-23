import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiffFileGroup } from "./diffGroups";
import { ReviewDiff } from "./ReviewDiff";

const patch = `diff --git a/changed.ts b/changed.ts
--- a/changed.ts
+++ b/changed.ts
@@ -1,3 +1,3 @@
 keep
-old text
+new text
 tail
diff --git a/added.ts b/added.ts
new file mode 100644
--- /dev/null
+++ b/added.ts
@@ -0,0 +1,2 @@
+added one
+added two
diff --git a/deleted.ts b/deleted.ts
deleted file mode 100644
--- a/deleted.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-deleted one
-deleted two
`;

const render = (loadFile?: (path: string, side: "old" | "new") => Promise<string>) =>
	renderToStaticMarkup(
		<ReviewDiff
			patch={patch}
			revisionId="r"
			threads={[]}
			mode="split"
			theme="light"
			renderThread={() => null}
			onSelect={() => {}}
			onFiles={() => {}}
			loadFile={loadFile}
		/>,
	);

// The text of each column of each `.review-diff-split-row`, as [left, right].
const splitColumns = (html: string) =>
	[...html.matchAll(/<div class="review-diff-split-row"><div>(.*?)<\/div><div>(.*?)<\/div><\/div>/g)].map((match) =>
		[match[1]!, match[2]!].map((column) =>
			[...column.matchAll(/<code>(.*?)<\/code>/g)].map((code) => code[1]).join(""),
		),
	);

test("split mode draws the old line on the left and the new line on the right", () => {
	expect(splitColumns(render())).toEqual([
		["keep", "keep"],
		["old text", "new text"],
		["tail", "tail"],
	]);
});

test("split mode draws an added or a deleted file in one column", () => {
	const html = render();
	for (const text of ["added one", "added two", "deleted one", "deleted two"]) {
		expect(html).toContain(`<code>${text}</code>`);
		expect(splitColumns(html).flat()).not.toContain(text);
	}
});

test("a diff that reads the file draws the expand controls, and one that does not draws none", () => {
	expect(render(async () => "")).toContain('aria-label="Expand down"');
	expect(render()).not.toContain('aria-label="Expand down"');
});

// GitHub writes this one line in place of the hunks of a file that holds
// bytes. The file then has no added line and no deleted line.
const binaryPatch = `diff --git a/logo.png b/logo.png
index 1c0d2f3..9ab8c7d 100644
Binary files a/logo.png and b/logo.png differ
`;

// One risk group that holds the paths in the order the diff must draw them.
const oneGroup = (paths: readonly string[]): DiffFileGroup[] => [
	{ key: "risk", label: "Risk", files: paths.map((path) => ({ path, reasons: [] })) },
];

const renderPatch = (source: string, groups?: DiffFileGroup[]) =>
	renderToStaticMarkup(
		<ReviewDiff
			patch={source}
			revisionId="r"
			threads={[]}
			mode="split"
			theme="light"
			renderThread={() => null}
			onSelect={() => {}}
			onFiles={() => {}}
			groups={groups}
		/>,
	);

test("a binary file says that the diff has no lines to show", () => {
	expect(renderPatch(binaryPatch)).toContain("Git stores this file as bytes, so the diff has no lines to show.");
});

test("a text file draws no such notice", () => {
	expect(renderPatch(patch)).not.toContain("Git stores this file as bytes");
});

test("the groups decide which file the diff draws first", () => {
	const html = renderPatch(patch, oneGroup(["deleted.ts", "added.ts", "changed.ts"]));

	const at = (path: string) => html.indexOf(`data-file-path="${path}"`);
	expect(at("deleted.ts")).toBeLessThan(at("added.ts"));
	expect(at("added.ts")).toBeLessThan(at("changed.ts"));
});

test("a path the groups leave out keeps its patch place, after every path they name", () => {
	const html = renderPatch(patch, oneGroup(["deleted.ts"]));

	const at = (path: string) => html.indexOf(`data-file-path="${path}"`);
	expect(at("deleted.ts")).toBeLessThan(at("changed.ts"));
	expect(at("changed.ts")).toBeLessThan(at("added.ts"));
});

test("no group keeps the patch order", () => {
	const html = renderPatch(patch);

	const at = (path: string) => html.indexOf(`data-file-path="${path}"`);
	expect(at("changed.ts")).toBeLessThan(at("added.ts"));
	expect(at("added.ts")).toBeLessThan(at("deleted.ts"));
});

test("the diff names each risk group above its first file, and says why a file sits there", () => {
	const html = renderPatch(patch, [
		{ key: "risk", label: "Risk", files: [{ path: "deleted.ts", reasons: ["deleted test"] }] },
		{ key: "tests", label: "Tests", files: [{ path: "added.ts", reasons: [] }] },
	]);

	expect(html).toContain('data-group="risk"');
	expect(html).toContain("Risk");
	expect(html).toContain("1 file");
	expect(html).toContain("deleted test");
	expect(html.indexOf('data-group="risk"')).toBeLessThan(html.indexOf('data-file-path="deleted.ts"'));
	expect(html.indexOf('data-file-path="deleted.ts"')).toBeLessThan(html.indexOf('data-group="tests"'));
});

test("a file header prints one path when Git did not rename the file", () => {
	const html = renderPatch(patch);

	expect(html).toContain("changed.ts");
	expect(html).not.toContain("changed.ts → changed.ts");
});
