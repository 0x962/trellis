import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
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

const renderPatch = (source: string, order?: readonly string[]) =>
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
			order={order}
		/>,
	);

test("a binary file says that the diff has no lines to show", () => {
	expect(renderPatch(binaryPatch)).toContain("Git stores this file as bytes, so the diff has no lines to show.");
});

test("a text file draws no such notice", () => {
	expect(renderPatch(patch)).not.toContain("Git stores this file as bytes");
});

test("the order prop decides which file the diff draws first", () => {
	const html = renderPatch(patch, ["deleted.ts", "added.ts", "changed.ts"]);

	const at = (path: string) => html.indexOf(`data-file-path="${path}"`);
	expect(at("deleted.ts")).toBeLessThan(at("added.ts"));
	expect(at("added.ts")).toBeLessThan(at("changed.ts"));
});

test("a path the order leaves out keeps its patch place, after every named path", () => {
	const html = renderPatch(patch, ["deleted.ts"]);

	const at = (path: string) => html.indexOf(`data-file-path="${path}"`);
	expect(at("deleted.ts")).toBeLessThan(at("changed.ts"));
	expect(at("changed.ts")).toBeLessThan(at("added.ts"));
});

test("no order keeps the patch order", () => {
	const html = renderPatch(patch);

	const at = (path: string) => html.indexOf(`data-file-path="${path}"`);
	expect(at("changed.ts")).toBeLessThan(at("added.ts"));
	expect(at("added.ts")).toBeLessThan(at("deleted.ts"));
});
