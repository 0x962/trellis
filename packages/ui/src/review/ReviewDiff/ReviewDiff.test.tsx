import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReviewDiff } from "./ReviewDiff";

const patch =
	"diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n same\n";

test("the compact diff keeps file counts, split rows, comments, and line selection", () => {
	const onFiles = mock(() => {});
	const onSelect = mock(() => {});
	render(
		<ReviewDiff
			patch={patch}
			revisionId="current"
			threads={[
				{
					path: "src/a.ts",
					side: "new",
					startLine: 1,
					line: 1,
					id: "thread",
					version: 1,
					updatedAt: "today",
					revisionId: "current",
				},
			]}
			mode="split"
			theme="light"
			renderThread={(id) => <article>{id}</article>}
			onSelect={onSelect}
			onFiles={onFiles}
		/>,
	);
	expect(onFiles).toHaveBeenCalledWith([{ path: "src/a.ts", type: "change", additions: 1, deletions: 1 }]);
	expect(document.querySelector("diffs-container")?.getAttribute("data-diff-type")).toBe("split");
	expect(screen.getByText("thread")).toBeDefined();
	const addition = document.querySelector<HTMLElement>("[data-line-type='change-addition']")!;
	fireEvent.click(addition);
	expect(onSelect).toHaveBeenCalledWith({ path: "src/a.ts", side: "new", startLine: 1, line: 1 });
});

test("the compact diff reports an empty filter result", () => {
	render(
		<ReviewDiff
			patch={patch}
			revisionId="current"
			threads={[]}
			mode="unified"
			theme="system"
			filter="missing"
			renderThread={() => null}
			onSelect={() => {}}
			onFiles={() => {}}
		/>,
	);
	expect(screen.getByRole("heading", { name: "No matching files" })).toBeDefined();
});
