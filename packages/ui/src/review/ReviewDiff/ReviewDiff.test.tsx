import { expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

test("the compact diff expands full-file context outside a patch hunk", async () => {
	const loadFile = mock(async () => "before\nold\nafter\n");
	render(
		<ReviewDiff
			patch={"diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -2 +2 @@\n-old\n+new\n"}
			revisionId="current"
			threads={[]}
			mode="unified"
			theme="light"
			renderThread={() => null}
			onSelect={() => {}}
			onFiles={() => {}}
			loadFile={loadFile}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Show full file" }));
	await waitFor(() => expect(screen.getByText("before")).toBeDefined());
	expect(screen.getByText("after")).toBeDefined();
	expect(loadFile).toHaveBeenCalledWith("src/a.ts", "old");
	expect(loadFile).toHaveBeenCalledWith("src/a.ts", "new");
});

test("pointer and keyboard range selection create one ordered anchor", () => {
	const onSelect = mock(() => {});
	render(
		<ReviewDiff
			patch={patch}
			revisionId="current"
			threads={[]}
			mode="unified"
			theme="light"
			renderThread={() => null}
			onSelect={onSelect}
			onFiles={() => {}}
		/>,
	);
	const first = document.querySelector<HTMLElement>("[data-side='new'][data-line-number='1']")!;
	const second = document.querySelector<HTMLElement>("[data-side='new'][data-line-number='2']")!;
	fireEvent.pointerDown(first);
	fireEvent.pointerUp(second);
	expect(onSelect).toHaveBeenLastCalledWith({ path: "src/a.ts", side: "new", startLine: 1, line: 2 });
	fireEvent.keyDown(first, { key: "Enter" });
	fireEvent.keyDown(second, { key: "Enter", shiftKey: true });
	expect(onSelect).toHaveBeenLastCalledWith({ path: "src/a.ts", side: "new", startLine: 1, line: 2 });
});

test("the compact diff mounts only the visible rows of a large patch", () => {
	const lines = Array.from({ length: 200 }, (_, index) => ` line ${index + 1}`).join("\n");
	const { container } = render(
		<ReviewDiff
			patch={`diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,200 +1,200 @@\n${lines}\n`}
			revisionId="current"
			threads={[]}
			mode="unified"
			theme="light"
			renderThread={() => null}
			onSelect={() => {}}
			onFiles={() => {}}
		/>,
	);
	expect(container.querySelectorAll(".review-diff-line").length).toBeLessThan(100);
	act(() => {
		const viewport = container.querySelector<HTMLElement>(".review-code")!;
		Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
		viewport.scrollTop = 2400;
		fireEvent.scroll(viewport);
	});
	expect(screen.getByText("line 100")).toBeDefined();
});
