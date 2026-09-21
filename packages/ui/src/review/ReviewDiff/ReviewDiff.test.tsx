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
