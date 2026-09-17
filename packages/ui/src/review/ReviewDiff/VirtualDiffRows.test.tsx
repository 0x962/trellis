import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { VirtualDiffRows } from "./VirtualDiffRows";
import type { ReviewFile } from "./parseReviewFiles";
import type { ReviewRow } from "./reviewRows";

const file = (name: string): ReviewFile => ({ name, type: "change", deletionLines: [], additionLines: [], hunks: [] });
const fileRow = (name: string): ReviewRow => ({ kind: "file", key: `${name}:file`, file: file(name) });
const endRow = (name: string): ReviewRow => ({ kind: "end", key: `${name}:end`, file: file(name) });

const renderRow = (row: ReviewRow) => <div>{row.key}</div>;
const scroller = (root: HTMLElement) => root.querySelector("diffs-container") as HTMLElement;

// Opening a composer rebuilds the rows without changing the selection, so
// the list keeps its scroll position instead of jumping to the file header.
test("keeps the scroll position when rows rebuild under the same selection", () => {
	const first: ReviewRow[] = [fileRow("src/a.ts"), endRow("src/a.ts"), fileRow("src/b.ts"), endRow("src/b.ts")];
	const view = render(
		<VirtualDiffRows rows={first} mode="unified" theme="light" selectedFile="src/b.ts" renderRow={renderRow} />,
	);
	// The b.ts header sits after the 48 px a.ts header and the 16 px file end.
	expect(scroller(view.container).scrollTop).toBe(64);
	const second: ReviewRow[] = [
		fileRow("src/a.ts"),
		{ kind: "annotation", key: "src/a.ts:annotations", file: file("src/a.ts"), annotations: ["composer"] },
		endRow("src/a.ts"),
		fileRow("src/b.ts"),
		endRow("src/b.ts"),
	];
	view.rerender(
		<VirtualDiffRows rows={second} mode="unified" theme="light" selectedFile="src/b.ts" renderRow={renderRow} />,
	);
	expect(scroller(view.container).scrollTop).toBe(64);
});

// Moving to another file scrolls its header into view.
test("scrolls to the newly selected file", () => {
	const rows: ReviewRow[] = [fileRow("src/a.ts"), endRow("src/a.ts"), fileRow("src/b.ts"), endRow("src/b.ts")];
	const view = render(
		<VirtualDiffRows rows={rows} mode="unified" theme="light" selectedFile="src/a.ts" renderRow={renderRow} />,
	);
	expect(scroller(view.container).scrollTop).toBe(0);
	view.rerender(
		<VirtualDiffRows rows={rows} mode="unified" theme="light" selectedFile="src/b.ts" renderRow={renderRow} />,
	);
	expect(scroller(view.container).scrollTop).toBe(64);
});
